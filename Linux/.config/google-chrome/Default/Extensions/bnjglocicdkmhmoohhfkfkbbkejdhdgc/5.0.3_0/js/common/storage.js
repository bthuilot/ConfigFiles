/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';

(function() {

  const global_storage_scope = 'global';

  function storage_key(account_key_or_list, key) {
    if(typeof account_key_or_list === 'object') {
      let all_results = [];
      tool.each(account_key_or_list, (i, account_key) => {
        all_results = all_results.concat(storage_key(account_key, key));
      });
      return all_results;
    } else {
      let prefix = 'cryptup_' + account_key_or_list.replace(/[^A-Za-z0-9]+/g, '').toLowerCase() + '_';
      if(typeof key === 'object') {
        let account_storage_keys = [];
        tool.each(key, (i, k) => {
          account_storage_keys.push(prefix + k);
        });
        return account_storage_keys;
      } else {
        return prefix + key;
      }
    }
  }

  function account_storage_object_keys_to_original(account_or_accounts, storage_object) {
    if(typeof account_or_accounts === 'string') {
      let fixed_keys_object = {};
      tool.each(storage_object, (k, v) => {
        let fixed_key = k.replace(storage_key(account_or_accounts, ''), '');
        if(fixed_key !== k) {
          fixed_keys_object[fixed_key] = v;
        }
      });
      return fixed_keys_object;
    } else {
      let results_by_account = {};
      tool.each(account_or_accounts, (i, account) => {
        results_by_account[account] = account_storage_object_keys_to_original(account, storage_object);
      });
      return results_by_account;
    }
  }

  function get_storage(storage_type) {
    try {
      if(storage_type === 'local') {
        return localStorage;
      } else if(storage_type === 'session') {
        return sessionStorage;
      } else {
        throw new Error('unknown type of storage: "' + storage_type + '", use either "local" or "session"');
      }
    } catch(error) {
      if(error.name === 'SecurityError') {
        return null;
      } else {
        throw error;
      }
    }
  }

  function notify_about_storage_access_error(account_email, parent_tab_id) {
    if(parent_tab_id) {
      let msg = 'Your browser settings are keeping FlowCrypt from working properly. <a href="#" class="content_settings">Click here to fix it</a>. When fixed, <a href="#" class="reload">reload this page</a>.';
      tool.browser.message.send(parent_tab_id, 'notification_show', {notification: msg});
    } else {
      console.log('SecurityError: cannot access localStorage or sessionStorage');
    }
  }

  function storage_set(storage_type, account_email, key, parent_tab_id) {
    let storage = get_storage(storage_type);
    if(storage === null) {
      notify_about_storage_access_error(account_email, parent_tab_id);
      return;
    }
    let value = storage[storage_key(account_email, key)];
    if(typeof value === 'undefined') {
      return value;
    } else if(value === 'null#null') {
      return null;
    } else if(value === 'bool#true') {
      return true;
    } else if(value === 'bool#false') {
      return false;
    } else if(value.indexOf('int#') === 0) {
      return Number(value.replace('int#', '', 1));
    } else if(value.indexOf('json#') === 0) {
      return JSON.parse(value.replace('json#', '', 1));
    } else {
      return value.replace('str#', '', 1);
    }
  }

  function restricted_set(storage_type, account_email, key, value) {
    let storage = get_storage(storage_type);
    let account_key = storage_key(account_email, key);
    if(typeof value === 'undefined') {
      storage.removeItem(account_key);
    } else if(value === null) {
      storage[account_key] = 'null#null';
    } else if(value === true || value === false) {
      storage[account_key] = 'bool#' + value;
    } else if(value + 0 === value) {
      storage[account_key] = 'int#' + value;
    } else if(typeof value === 'object') {
      storage[account_key] = 'json#' + JSON.stringify(value);
    } else {
      storage[account_key] = 'str#' + value;
    }
  }

  function passphrase_save(storage_type, account_email, longid, passphrase) {
    if(longid && longid !== keys_get(account_email, 'primary').longid) {
      restricted_set(storage_type, account_email, 'passphrase_' + longid, passphrase);
    } else {
      restricted_set(storage_type, account_email, 'master_passphrase', passphrase);
    }
  }

  function passphrase_get(account_email, longid) {
    if(longid) {
      let stored = storage_set('local', account_email, 'passphrase_' + longid);
      if(stored) {
        return stored;
      } else {
        let temporary = storage_set('session', account_email, 'passphrase_' + longid);
        if(temporary) {
          return temporary;
        } else {
          let primary_k = keys_get(account_email, 'primary');
          if(primary_k && primary_k.longid === longid) {
            return passphrase_get(account_email); //todo - do a storage migration so that we don't have to keep trying to query the "old way of storing"
          } else {
            return null;
          }
        }
      }
    } else { //todo - this whole part would also be unnecessary if we did a migration
      if(storage_set('local', account_email, 'master_passphrase_needed') === false) {
        return '';
      }
      let stored = storage_set('local', account_email, 'master_passphrase');
      if(stored) {
        return stored;
      }
      let temporary = storage_set('session', account_email, 'master_passphrase');
      if(temporary) {
        return temporary;
      }
      return null;
    }
  }

  function keys_get(account_email, longid) {
    let keys = storage_set('local', account_email, 'keys') || [];
    if(typeof longid !== 'undefined') { // looking for a specific key(s)
      let found;
      if(typeof longid === 'object') { // looking for an array of keys
        found = [];
        tool.each(keys, (i, keyinfo) => {
          if(tool.value(keyinfo.longid).in(longid) || (tool.value('primary').in(longid) && keyinfo.primary)) {
            found.push(keyinfo);
          }
        });
      } else { // looking for a single key
        found = null;
        tool.each(keys, (i, keyinfo) => {
          if(keyinfo.longid === longid || (longid === 'primary' && keyinfo.primary)) {
            found = keyinfo;
          }
        });
      }
      return found;
    } else { // return all keys
      return keys;
    }
  }

  function keys_object(armored_prv, primary = false) {
    let longid = tool.crypto.key.longid(armored_prv);
    return {
      private: armored_prv,
      public: tool.crypto.key.read(armored_prv).toPublic().armor(),
      primary: primary,
      longid: longid,
      fingerprint: tool.crypto.key.fingerprint(armored_prv),
      keywords: window.mnemonic(longid),
    };
  }

  function keys_add(account_email, new_key_armored) {
    // todo: refactor setup.js -> backup.js flow so that keys are never saved naked, then re-enable naked check below
    let keys = keys_get(account_email);
    let updated = false;
    let new_key_longid = tool.crypto.key.longid(new_key_armored);
    if(new_key_longid) {
      // if(openpgp.key.readArmored(new_key_armored).keys[0].primaryKey.isDecrypted) {
      //   catcher.report('private_keys_add: attempting to add a naked key, aborted');
      //   return;
      // }
      tool.each(keys, (i, keyinfo) => {
        if(new_key_longid === keyinfo.longid) { // replacing a key
          keys[i] = keys_object(new_key_armored, keyinfo.primary);
          updated = true;
        }
      });
      if(!updated) {
        keys.push(keys_object(new_key_armored, keys.length === 0));
      }
      restricted_set('local', account_email, 'keys', keys);
    }
  }

  function keys_remove(account_email, remove_longid) {
    let private_keys = keys_get(account_email);
    let filtered_private_keys = [];
    tool.each(private_keys, (i, keyinfo) => {
      if(keyinfo.longid !== remove_longid) {
        filtered_private_keys.push(keyinfo);
      }
    });
    restricted_set('local', account_email, 'keys', filtered_private_keys);
  }

  function extension_storage_set(account_email, values, callback) {
    if(!account_email) {
      account_email = global_storage_scope;
    }
    let storage_update = {};
    tool.each(values, (key, value) => {
      storage_update[storage_key(account_email, key)] = value;
    });
    chrome.storage.local.set(storage_update, () => {
      catcher.try(() => {
        if(typeof callback !== 'undefined') {
          callback();
        }
      })();
    });
  }

  function extension_storage_get(account_or_accounts, keys, callback) {
    if(!account_or_accounts) {
      account_or_accounts = global_storage_scope;
    }
    chrome.storage.local.get(storage_key(account_or_accounts, keys), storage_object => {
      catcher.try(() => {
        callback(account_storage_object_keys_to_original(account_or_accounts, storage_object));
      })();
    });
  }

  function extension_storage_remove(account_email, key_or_keys, callback) {
    if(!account_email) {
      account_email = global_storage_scope;
    }
    chrome.storage.local.remove(storage_key(account_email, key_or_keys), () => {
      catcher.try(() => {
        if(typeof callback !== 'undefined') {
          callback();
        }
      })();
    });
  }

  function account_emails_get(callback) {
    extension_storage_get(null, ['account_emails'], storage => {
      let account_emails = [];
      if(typeof storage.account_emails !== 'undefined') {
        tool.each(JSON.parse(storage.account_emails), function (i, account_email) {
          if(!tool.value(account_email.toLowerCase()).in(account_emails)) {
            account_emails.push(account_email.toLowerCase());
          }
        });
      }
      callback(account_emails);
    });
  }

  function account_emails_add(account_email, callback) { //todo: concurrency issues with another tab loaded at the same time
    account_emails_get(function (account_emails) {
      if(!account_email) {
        catcher.report('attempting to save empty account_email: ' + account_email);
      }
      if(!tool.value(account_email).in(account_emails) && account_email) {
        account_emails.push(account_email);
        extension_storage_set(null, { account_emails: JSON.stringify(account_emails) }, () => {
          tool.browser.message.send(null, 'update_uninstall_url', null, callback);
        });
      } else if(typeof callback !== 'undefined') {
        callback();
      }
    });
  }

  function flowcrypt_auth_info(callback) {
    extension_storage_get(null, ['cryptup_account_email', 'cryptup_account_uuid', 'cryptup_account_verified'], storage => {
      callback(storage.cryptup_account_email, storage.cryptup_account_uuid, storage.cryptup_account_verified);
    });
  }

  function flowcrypt_subscription(callback) {
    extension_storage_get(null, ['cryptup_account_email', 'cryptup_account_uuid', 'cryptup_account_verified', 'cryptup_account_subscription'], s => {
      if(s.cryptup_account_email && s.cryptup_account_uuid && s.cryptup_account_verified && s.cryptup_account_subscription && s.cryptup_account_subscription.level) {
        callback(s.cryptup_account_subscription.level, s.cryptup_account_subscription.expire, !s.cryptup_account_subscription.expired, s.cryptup_account_subscription.method || 'trial');
      } else {
        callback(null, null, false, null);
      }
    });
  }

  /* db */

  function normalize_string(str) {
    return str.normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase();
  }

  function db_denied() {
    throw new Error('db_denied is not callable');
  }

  function db_private_mode_error() {
    throw new Error('db_private_mode_error is not callable');
  }

  function db_error_handle(exception, error_stack, callback) {
    exception.stack = error_stack.replace(/^Error/, String(exception));
    catcher.handle_exception(exception);
    if(typeof callback === 'function') {
      callback(db_denied);
    }
  }

  function db_open(callback) {
    let open_db;
    try {
      open_db = indexedDB.open('cryptup', 2);
    } catch (error) {
      if(error.name === 'SecurityError') { // firefox
        callback(db_denied);
        return;
      }
      throw error;
    }
    open_db.onupgradeneeded = function (event) {
      let contacts;
      if(event.oldVersion < 1) {
        contacts = open_db.result.createObjectStore('contacts', { keyPath: 'email', });
        contacts.createIndex('search', 'searchable', { multiEntry: true, });
        contacts.createIndex('index_has_pgp', 'has_pgp');
        contacts.createIndex('index_pending_lookup', 'pending_lookup');
      }
      if(event.oldVersion < 2) {
        contacts = open_db.transaction.objectStore('contacts');
        contacts.createIndex('index_longid', 'longid');
      }
    };
    let handled = 0; // the indexedDB docs don't say if onblocked and onerror can happen in the same request, or if the event/exception bubbles to both
    open_db.onsuccess = catcher.try(() => {
      handled++;
      callback(open_db.result);
    });
    let stack_fill = (new Error()).stack;
    open_db.onblocked = catcher.try(() => db_error_handle(open_db.error, stack_fill, handled++ ? null : callback));
    open_db.onerror = catcher.try(() => {
      if(open_db.error.message === 'The user denied permission to access the database.') { // chrome
        callback(db_denied);
      } else if(open_db.error.message === 'A mutation operation was attempted on a database that did not allow mutations.') { // firefox
        callback(db_private_mode_error);
      } else {
        db_error_handle(open_db.error, stack_fill, handled++ ? null : callback);
      }
    });
  }

  function db_index(has_pgp, substring) {
    if(!substring) {
      throw new Error('db_index has to include substring');
    }
    return(has_pgp ? 't:' : 'f:') + substring;
  }

  function db_create_search_index_list(email, name, has_pgp) {
    email = email.toLowerCase();
    name = name ? name.toLowerCase() : '';
    let parts = [email, name];
    parts = parts.concat(email.split(/[^a-z0-9]/));
    parts = parts.concat(name.split(/[^a-z0-9]/));
    let index = [];
    tool.each(parts, (i, part) => {
      if(part) {
        let substring = '';
        tool.each(part.split(''), (i, letter) => {
          substring += letter;
          let normalized = normalize_string(substring);
          if(!tool.value(normalized).in(index)) {
            index.push(db_index(has_pgp, normalized));
          }
        });
      }
    });
    return index;
  }

  function db_contact_object(email, name, client, pubkey, attested, pending_lookup, last_use) {
    return {
      email: email,
      name: name || null,
      pubkey: pubkey,
      has_pgp: Number(Boolean(pubkey)),
      searchable: db_create_search_index_list(email, name, Boolean(pubkey)),
      client: pubkey ? client : null,
      attested: pubkey ? Boolean(attested) : null,
      fingerprint: pubkey ? tool.crypto.key.fingerprint(pubkey) : null,
      longid: pubkey ? tool.crypto.key.longid(pubkey) : null,
      keywords: pubkey ? mnemonic(tool.crypto.key.longid(pubkey)) : null,
      pending_lookup: pubkey ? 0 : Number(Boolean(pending_lookup)),
      last_use: last_use || null,
    };
  }

  function db_contact_save(db, contact, callback) {
    if(Array.isArray(contact)) {
      let processed = 0;
      tool.each(contact, (i, single_contact) => {
        db_contact_save(db, single_contact, () => {
          if(++processed === contact.length && typeof callback === 'function') {
            callback();
          }
        });
      });
    } else {
      let tx = db.transaction('contacts', 'readwrite');
      let contacts = tx.objectStore('contacts');
      contacts.put(contact);
      tx.oncomplete = catcher.try(callback);
      let stack_fill = (new Error()).stack;
      tx.onabort = catcher.try(() => db_error_handle(tx.error, stack_fill, callback));
    }
  }

  function db_contact_update(db, email, update, callback) {
    if(Array.isArray(email)) {
      let processed = 0;
      tool.each(email, (i, single_email) => {
        db_contact_update(db, single_email, update, () => {
          if(++processed === email.length && typeof callback === 'function') {
            callback();
          }
        });
      });
    } else {
      db_contact_get(db, email, (original) => {
        let updated = {};
        tool.each(original, (k, original_value) => {
          if(k in update) {
            updated[k] = update[k];
          } else {
            updated[k] = original_value;
          }
        });
        let tx = db.transaction('contacts', 'readwrite');
        let contacts = tx.objectStore('contacts');
        contacts.put(db_contact_object(email, updated.name, updated.client, updated.pubkey, updated.attested, updated.pending_lookup, updated.last_use));
        tx.oncomplete = catcher.try(callback);
        let stack_fill = (new Error()).stack;
        tx.onabort = catcher.try(() => db_error_handle(tx.error, stack_fill, callback));
      });
    }
  }

  function db_contact_get(db, email_or_longid, callback) {
    if(typeof email_or_longid !== 'object') {
      let get;
      if(!(/^[A-F0-9]{16}$/g).test(email_or_longid)) { // email
        get = db.transaction('contacts', 'readonly').objectStore('contacts').get(email_or_longid);
      } else { // longid
        get = db.transaction('contacts', 'readonly').objectStore('contacts').index('index_longid').get(email_or_longid);
      }
      get.onsuccess = catcher.try(() => {
        if(get.result !== undefined) {
          callback(get.result);
        } else {
          callback(null);
        }
      });
      let stack_fill = (new Error()).stack;
      get.onerror = function () {
        db_error_handle(get.error, stack_fill, callback);
      };
    } else {
      let results = new Array(email_or_longid.length);
      let finished = 0;
      tool.each(email_or_longid, (i, single_email_or_longid) => {
        db_contact_get(db, single_email_or_longid, contact => {
          results[i] = contact;
          if(++finished >= email_or_longid.length) {
            callback(results);
          }
        });
      });
    }
  }

  const db_query_keys = ['limit', 'substring', 'has_pgp'];

// query: substring, has_pgp, limit. All voluntary
  function db_contact_search(db, query, callback) {
    tool.each(query, (key, value) => {
      if(!tool.value(key).in(db_query_keys)) {
        throw new Error('db_contact_search: unknown key: ' + key);
      }
    });
    let contacts = db.transaction('contacts', 'readonly').objectStore('contacts');
    let search;
    if(typeof query.has_pgp === 'undefined') { // any query.has_pgp value
      query.substring = normalize_string(query.substring);
      if(query.substring) {
        db_contact_search(db, { substring: query.substring, limit: query.limit, has_pgp: true, }, (results_with_pgp) => {
          if(query.limit && results_with_pgp.length === query.limit) {
            callback(results_with_pgp);
          } else {
            db_contact_search(db, { substring: query.substring, limit: query.limit ? query.limit - results_with_pgp.length : undefined, has_pgp: false, }, results_without_pgp => {
              callback(results_with_pgp.concat(results_without_pgp));
            });
          }
        });
      } else {
        search = contacts.openCursor();
      }
    } else { // specific query.has_pgp value
      if(query.substring) {
        search = contacts.index('search').openCursor(IDBKeyRange.only(db_index(query.has_pgp, query.substring)));
      } else {
        search = contacts.index('index_has_pgp').openCursor(IDBKeyRange.only(Number(query.has_pgp)));
      }
    }
    if(typeof search !== 'undefined') {
      let found = [];
      search.onsuccess = catcher.try(() => {
        let cursor = search.result;
        if(!cursor || found.length === query.limit) {
          callback(found);
        } else {
          found.push(cursor.value);
          cursor.continue();
        }
      });
      let stack_fill = (new Error()).stack;
      search.onerror = catcher.try(() => db_error_handle(search.error, stack_fill, callback));
    }
  }

  window.flowcrypt_storage = {
    set: extension_storage_set,
    get: extension_storage_get,
    remove: extension_storage_remove,
    key: storage_key,
    account_emails_add: account_emails_add,
    account_emails_get: account_emails_get,
    db_contact_search: db_contact_search,
    db_contact_get: db_contact_get,
    db_contact_update: db_contact_update,
    db_contact_save: db_contact_save,
    db_contact_object: db_contact_object,
    db_open: db_open,
    db_private_mode_error: db_private_mode_error,
    db_denied: db_denied,
    subscription: flowcrypt_subscription,
    auth_info: flowcrypt_auth_info,
    keys_object: keys_object,
    keys_add: keys_add,
    keys_get: keys_get,
    keys_remove: keys_remove,
    passphrase_get: passphrase_get,
    passphrase_save: passphrase_save,
    restricted_set: restricted_set,
    restricted_get: storage_set,
    notify_error: notify_about_storage_access_error,
  };

})();