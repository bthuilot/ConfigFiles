/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';

tool.ui.event.protect();

let url_params = tool.env.url_params(['account_email', 'parent_tab_id', 'placement']); // placement: compose||settings

window.flowcrypt_storage.subscription(function (level, expire, active) {
  if(active) {
    window.flowcrypt_storage.get(url_params.account_email, ['email_footer'], storage => {
      $('.input_email_footer').val(storage.email_footer);
    });
    $('.user_subscribed').css('display', 'block');
  } else {
    $('.user_free').css('display', 'block');
    $('.action_upgrade').click(tool.ui.event.prevent(tool.ui.event.double(), function(self) {
      tool.browser.message.send(url_params.parent_tab_id, 'subscribe', {}, function (newly_active) {
        if(newly_active) {
          $('.user_subscribed').css('display', 'block');
          $('.user_free').css('display', 'none');
        }
      });
    }));
  }
  $('.action_add_footer').click(tool.ui.event.prevent(tool.ui.event.double(), function(self) {
    save_footer_if_has_subscription_and_requested($('.input_remember').prop('checked'), $('.input_email_footer').val(), function () {
      tool.browser.message.send(url_params.parent_tab_id, 'set_footer', {footer: $('.input_email_footer').val()});
    });
  }));
  $('.action_cancel').click(tool.ui.event.prevent(tool.ui.event.double(), function(self) {
    tool.browser.message.send(url_params.parent_tab_id, 'close_dialog');
  }));
});

function save_footer_if_has_subscription_and_requested(requested, footer, cb) {
  window.flowcrypt_storage.subscription(function (level, expire, active) {
    if(requested && active) {
      window.flowcrypt_storage.set(url_params.account_email, { 'email_footer': footer }, cb);
    } else {
      cb();
    }
  });
}