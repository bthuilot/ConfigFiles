/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';

tool.ui.event.protect();

let url_params = tool.env.url_params(['account_email', 'verification_email_text', 'parent_tab_id', 'subscribe_result_tab_id']);

let token = window.flowcrypt_account.parse_token_email_text(url_params.verification_email_text);

if(!token) {
  render_status('This verification email seems to have wrong format. Please write me at human@flowcrypt.com to fix this.');
} else {
  window.flowcrypt_storage.get(null, ['cryptup_subscription_attempt'], storage => {
    let product_to_subscribe_to = storage.cryptup_subscription_attempt;
    window.flowcrypt_account.verify(url_params.account_email, [token]).then(response => {
      if(product_to_subscribe_to) {
        window.flowcrypt_account.subscribe(url_params.account_email, product_to_subscribe_to, product_to_subscribe_to.source).then(subscription => {
          if(subscription && subscription.level === 'pro') {
            render_status('Welcome to FlowCrypt Advanced.');
          } else {
            render_status('Email verified, but had trouble enabling FlowCrypt Advanced. Please write me at human@flowcrypt.com to fix this.');
          }
        }, handle_error_response);
      } else {
        render_status('Email verified, no further action needed.');
      }
    }, handle_error_response);
  });
}

function handle_error_response(error) {
  render_status('Could not complete: ' + error.message);
  catcher.log('problem in verification.js', error);
}

function render_status(content, spinner) {
  $('body .status').html(content + (spinner ? ' ' + tool.ui.spinner('white') : ''));
}