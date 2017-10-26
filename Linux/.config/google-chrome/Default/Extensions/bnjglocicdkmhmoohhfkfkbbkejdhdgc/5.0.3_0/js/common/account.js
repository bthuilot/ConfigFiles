/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';


(function() {

  const cryptup_verification_email_sender = 'verify@cryptup.org';

  const _self = {
    parse_token_email_text: parse_token_email_text,
    save_subscription_attempt: save_subscription_attempt,
    config: set_event_handlers,
    register: register_and_attempt_to_verify,
    verify: verify,
    register_new_device: register_new_device,
    subscribe: subscribe,
    PRODUCTS: {
      null: {id: null, method: null, name: null, level: null},
      trial: { id: 'free_month', method: 'trial', name: 'trial', level: 'pro' },
      advanced_monthly: { id: 'cu-adv-month', method: 'stripe', name: 'advanced_monthly', level: 'pro' },
    },
    CAN_READ_EMAIL: true,
  };

  let callbacks = {
    render_status: function () {},
    find_matching_tokens_from_email: fetch_token_emails_on_gmail_and_find_matching_token,
  };

  function subscribe(account_email, chosen_product, source) {
    callbacks.render_status(chosen_product.method === 'trial' ? 'enabling trial..' : 'upgrading..', true);
    return catcher.Promise((resolve, reject) => {
      tool.api.cryptup.account_check_sync(updated => {
        window.flowcrypt_storage.auth_info((email, uuid, verified) => {
          if(verified) {
            do_subscribe(chosen_product, source).then(resolve, error => {
              if(error.internal === 'auth') {
                save_subscription_attempt(chosen_product, source, () => {
                  register_and_attempt_to_verify(account_email).then(response => {
                    do_subscribe(chosen_product, source).then(resolve, reject);
                  }, reject)
                });
              } else {
                reject(error);
              }
            });
          } else {
            save_subscription_attempt(chosen_product, source, () => {
              register_and_attempt_to_verify(account_email).then(response => {
                do_subscribe(chosen_product, source).then(resolve, reject);
              }, reject)
            });
          }
        });
      });
    });
  }

  function do_subscribe(chosen_product, source=null) {
    return catcher.Promise((resolve, reject) => {
      window.flowcrypt_storage.remove(null, 'cryptup_subscription_attempt', () => {
        return tool.api.cryptup.account_subscribe(chosen_product.id, chosen_product.method, source).then(response => {
          if(response.subscription.level === chosen_product.level && response.subscription.method === chosen_product.method) {
            resolve(response.subscription);
          } else {
            reject({code: null, message: 'Something went wrong when upgrading, please email me at human@flowcrypt.com to fix this.', internal: 'mismatch'});
          }
        }, reject); // todo - deal with auth error? would need to know account_email for new registration
      });
    });
  }

  function parse_token_email_text(verification_email_text, stored_uuid_to_cross_check) {
    let token_link_match = verification_email_text.match(/account\/login?([^\s"<]+)/g);
    if(token_link_match !== null) {
      let token_link_params = tool.env.url_params(['account', 'uuid', 'token'], token_link_match[0].split('?')[1]);
      if ((!stored_uuid_to_cross_check || token_link_params.uuid === stored_uuid_to_cross_check) && token_link_params.token) {
        return token_link_params.token;
      }
    }
  }

  function fetch_token_emails_on_gmail_and_find_matching_token(account_email, uuid, callback) {
    let called_back = false;
    function callback_once(v1, v2) {
      if(!called_back) {
        called_back = true;
        callback(v1, v2);
      }
    }
    let tokens = [];
    tool.api.gmail.message_list(account_email, 'from:' + cryptup_verification_email_sender + ' to:' + account_email + ' in:anywhere', true, (list_success, response) => {
      if(list_success) {
        if(response.messages) {
          tool.api.gmail.message_get(account_email, response.messages.map(m => m.id), 'full', (get_success, messages) => {
            if(get_success) {
              tool.each(messages, (id, gmail_message_object) => {
                if(gmail_message_object.payload.mimeType === 'text/plain' && gmail_message_object.payload.body.size > 0) {
                  let token = parse_token_email_text(tool.str.base64url_decode(gmail_message_object.payload.body.data), uuid);
                  if(token) {
                    tokens.push(token);
                  }
                }
              });
              tokens.reverse();
              callback_once(Boolean(tokens.length), tokens.length ? tokens : null);
            } else {
              callback_once(false, null);
            }
          });
        } else {
          callback_once(true, null);
        }
      } else {
        callback_once(false, null);
      }
    });
  }


  function wait_for_token_email(timeout, callback) {
    if(timeout < 20) {
      callbacks.render_status('Still working..');
    } else if(timeout < 10) {
      callbacks.render_status('A little while more..');
    }
    let end = Date.now() + timeout * 1000;
    window.flowcrypt_storage.auth_info((account, uuid, verified) => {
      callbacks.find_matching_tokens_from_email(account, uuid, (success, tokens) => {
        if(success && tokens) {
          callback(tokens);
        } else if(Date.now() < end) {
          setTimeout(() => wait_for_token_email((end - Date.now()) / 1000, callback), 5000);
        } else {
          callback(null);
        }
      });
    });
  }

  function save_subscription_attempt(product, source, callback) {
    product.source = source;
    window.flowcrypt_storage.set(null, { 'cryptup_subscription_attempt': product }, callback);
  }

  function verify(account_email, tokens) {
    callbacks.render_status('verifying your email address..', true);
    return catcher.Promise((resolve, reject) => {
      tool.api.cryptup.account_login(account_email, tokens.pop()).then(resolve, error => {
        if(error.internal === 'token' && tokens.length) {
          verify(account_email, tokens).then(resolve, reject); // attempt at Promise recursion. Until nothing left to try in tokens array
        } else {
          reject(error);
        }
      });
    });
  }

  function register_and_attempt_to_verify(account_email) {
    callbacks.render_status('registering..', true);
    return catcher.Promise((resolve, reject) => {
      tool.api.cryptup.account_login(account_email).then(response => {
        if(_self.CAN_READ_EMAIL) {
          callbacks.render_status('verifying..', true);
          wait_for_token_email(30, tokens => {
            if(tokens && tokens.length) {
              verify(account_email, tokens).then(resolve, reject);
            } else {
              reject({code: null, internal: 'email', message: 'Please check your inbox for a verification email'});
            }
          });
        } else {
          reject({code: null, internal: 'email', message: 'Please check your inbox for a verification email'});
        }
      }, reject);
    });
  }

  function register_new_device(account_email) {
    return catcher.Promise((resolve, reject) => {
      window.flowcrypt_storage.set(null, { cryptup_account_uuid: undefined, cryptup_account_verified: false }, () => {
        render_status('checking..', true);
        register_and_attempt_to_verify(account_email).then(resolve, reject);
      });
    });
  }

  function set_event_handlers(_callbacks) {
    $.each(_callbacks, (name, handler) => {
      callbacks[name] = handler;
    });
  }

  if(typeof window === 'object') {
    window.flowcrypt_account = _self;
  }

  if(typeof exports === 'object') {
    $.each(_self, (k, f) => {
      exports[a] = f;
    });
  }

})();