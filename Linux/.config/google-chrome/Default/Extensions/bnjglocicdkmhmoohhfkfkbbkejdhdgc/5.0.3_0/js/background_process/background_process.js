/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';

console.log('background_process.js starting');

let background_process_start_reason = 'browser_start';
chrome.runtime.onInstalled.addListener(function(event){
  background_process_start_reason = event.reason;
});
function get_background_process_start_reason() {
  return background_process_start_reason;
}

migrate_global(function () {
  window.flowcrypt_storage.set(null, { version: catcher.version('int') });
});

tool.browser.message.listen_background({
  close_popup: close_popup_handler,
  migrate_account: migrate_account,
  settings: open_settings_page_handler,
  attest_requested: attest_requested_handler,
  attest_packet_received: attest_packet_received_handler,
  update_uninstall_url: update_uninstall_url,
  get_active_tab_info: get_active_tab_info,
  runtime: (message, sender, respond) => respond({ environment: catcher.environment(), version: catcher.version() }),
  ping: (message, sender, respond) => respond(true),
  _tab_: (request, sender, respond) => {
    if(sender === 'background') {
      respond(null); // background script
    } else if(sender === null) {
      respond(undefined); // not sure when or why this happens - maybe orphaned frames during update
    } else { // firefox doesn't include frameId due to a bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1354337
      respond(sender.tab.id + ':' + (typeof sender.frameId !== 'undefined' ? sender.frameId : ''));
    }
  },
});

update_uninstall_url();

window.flowcrypt_storage.get(null, 'errors', storage => {
  if(storage.errors && storage.errors.length && storage.errors.length > 100) {
    window.flowcrypt_storage.remove(null, 'errors');
  }
});

if(!localStorage.settings_seen) {
  open_settings_page('initial.htm'); // called after the very first installation of the plugin
  localStorage.settings_seen = true;
}

inject_cryptup_into_webmail_if_needed();

schedule_cryptup_subscription_level_check();

function open_settings_page_handler(message, sender, respond) {
  open_settings_page(message.path, message.account_email, message.page, message.page_url_params);
  respond();
}

function get_active_tab_info(request, sender, respond) {
  chrome.tabs.query({ active: true, currentWindow: true, url: ["*://mail.google.com/*", "*://inbox.google.com/*"] }, tabs => {
    if(tabs.length) {
      chrome.tabs.executeScript(tabs[0].id, { code: 'var r = {account_email: window.account_email_global, same_world: window.same_world_global}; r' }, result => {
        respond({ provider: 'gmail', account_email: result[0].account_email || null, same_world: result[0].same_world === true });
      });
    } else {
      respond({ provider: null, account_email: null, same_world: null });
    }
  });
}

function get_cryptup_settings_tab_id_if_open(callback) {
  chrome.tabs.query({ currentWindow: true }, tabs => {
    let extension = chrome.extension.getURL('/');
    let found = false;
    tool.each(tabs, (i, tab) => {
      if(tool.value(extension).in(tab.url)) {
        callback(tab.id);
        found = true;
        return false;
      }
    });
    if(!found) {
      callback(null);
    }
  });
}

function update_uninstall_url(request, sender, respond) {
  window.flowcrypt_storage.account_emails_get(function (account_emails) {
    window.flowcrypt_storage.get(null, ['metrics'], storage => {
      if(typeof chrome.runtime.setUninstallURL !== 'undefined') {
        catcher.try(function () {
          chrome.runtime.setUninstallURL('https://flowcrypt.com/leaving.htm#' + JSON.stringify({
            email: (account_emails && account_emails.length) ? account_emails[0] : null,
            metrics: storage.metrics || null,
          }));
        })();
      }
      if(respond) {
        respond();
      }
    });
  });
}

function open_settings_page(path, account_email, page, page_url_params) {
  let base_path = chrome.extension.getURL('chrome/settings/' + (path || 'index.htm'));
  get_cryptup_settings_tab_id_if_open(function(opened_tab) {
    let open_tab = opened_tab ? function(url) { chrome.tabs.update(opened_tab, {url: url, active: true}); } : function(url) { chrome.tabs.create({url: url}); };
    if(account_email) {
      open_tab(tool.env.url_create(base_path, { account_email: account_email, page: page, page_url_params: page_url_params ? JSON.stringify(page_url_params) : null}));
    } else {
      window.flowcrypt_storage.account_emails_get(function (account_emails) {
        open_tab(tool.env.url_create(base_path, { account_email: account_emails[0], page: page, page_url_params: page_url_params ? JSON.stringify(page_url_params) : null }));
      });
    }
  });
}

function close_popup_handler(request, sender, respond) {
  chrome.tabs.query(request, tabs => {
    chrome.tabs.remove(tool.arr.select(tabs, 'id'));
  });
}
