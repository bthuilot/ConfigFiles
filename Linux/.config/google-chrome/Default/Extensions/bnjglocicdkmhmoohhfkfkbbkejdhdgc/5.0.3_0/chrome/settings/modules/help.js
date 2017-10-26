/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';

let url_params = tool.env.url_params(['account_email', 'parent_tab_id']);

$('.action_send_feedback').click(function () {
  let original_button_text = $(this).text();
  let button = this;
  $(this).html(tool.ui.spinner('white'));
  setTimeout(function () { // this is so that spinner starts spinning before a potential failed connection alert shows up
    let msg = $('#input_text').val() + '\n\n\nFlowCrypt ' + tool.env.browser().name +  ' ' +  catcher.version();
    tool.api.cryptup.help_feedback(url_params.account_email, msg).validate(r => r.sent).then(response => {
      $(button).text('sent!');
      alert('Message sent! You will find your response in ' + url_params.account_email + ', check your email later. Thanks!');
      tool.browser.message.send(url_params.parent_tab_id, 'close_page');
    }, error => {
      $(button).text(original_button_text);
      alert('There was an error sending message. My direct email is human@flowcrypt.com\n\n' + error.message);
    });
  }, 50);
});
