/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';

let url_params = tool.env.url_params(['account_email']);

$('#status').html('Loading from keyserver<br/><br/><br/>' + tool.ui.spinner('green'));

let primary_pubkey_armored = window.flowcrypt_storage.keys_get(url_params.account_email, 'primary').public;
let prv_headers = tool.crypto.armor.headers('private_key');

tool.api.attester.lookup_email(url_params.account_email).done(function (success, keyserver_result) {
  if(!success) {
    $('#status').html('Internet connection dropped. <div class="button long green reload">load again</div>');
    $('.reload').click(function () {
      window.location.reload();
    });
  } else if(!keyserver_result.pubkey || !keyserver_result.attested || tool.crypto.key.fingerprint(primary_pubkey_armored) === tool.crypto.key.fingerprint(keyserver_result.pubkey)) {
    show_settings_page('/chrome/settings/modules/keyserver.htm');
  } else { // email previously attested, and there indeed is a pubkey mismatch
    $('#status').html('Original key KeyWords:<br/><span class="good">' + mnemonic(tool.crypto.key.longid(keyserver_result.pubkey)) + '<br/>' + tool.crypto.key.fingerprint(keyserver_result.pubkey, 'spaced') + '</span>');
    $('#step_2b_manual_enter').css('display', 'block');
    $('.action_request_replacement').click(tool.ui.event.prevent(tool.ui.event.double(), function () {
      let old_key = openpgp.key.readArmored($('#step_2b_manual_enter .input_private_key').val()).keys[0];
      if(typeof old_key === 'undefined') {
        alert('Private key is not correctly formated. Please insert complete key, including "' + prv_headers.begin + '" and "' + prv_headers.end + '"\n\nEnter the private key you previously used. The corresponding public key is registered with your email, and the private key is needed to confirm this change.\n\nIf you chose to download your backup as a file, you should find it inside that file. If you backed up your key on Gmail, you will find there it by searching your inbox.');
      } else if(old_key.isPublic()) {
        alert('This was a public key. Please insert a private key instead. It\'s a block of text starting with "' + prv_headers.begin + '"');
      } else if(tool.crypto.key.fingerprint(old_key) === tool.crypto.key.fingerprint(primary_pubkey_armored)) {
        alert('This is your current key. Look for an older one. It will look very similar.');
      } else if(tool.crypto.key.fingerprint(old_key) !== tool.crypto.key.fingerprint(keyserver_result.pubkey)) {
        alert('Key does not match. Please try another key if you have multiple.');
      } else if(!tool.crypto.key.decrypt(old_key, $('.input_passphrase').val()).success) {
        alert('This is the right key! However, the pass phrase does not match. Please try a different pass phrase. Your original pass phrase might have been different then what you use now.');
      } else {
        let request_replacement = {
          'ATT': 'CRYPTUP', //todo - should be the original attester
          'ACT': 'REQUEST_REPLACEMENT',
          'ADD': tool.crypto.hash.double_sha1_upper(url_params.account_email),
          'OLD': tool.crypto.key.fingerprint(old_key),
          'PUB': tool.crypto.key.fingerprint(primary_pubkey_armored),
        };
        tool.api.attester.packet.create_sign(request_replacement, old_key).then(signed_packet => {
          tool.api.attester.replace_request(url_params.account_email, signed_packet, primary_pubkey_armored).validate(r => r.saved).then(response => {
            save_attest_request(url_params.account_email, 'CRYPTUP', function () { //todo - should be the original attester
              alert('Successfully requested Re-Attestation. It should get processed within a few minutes. You will also receive attestation email shortly. No further actions needed.');
              show_settings_page('/chrome/settings/modules/keyserver.htm');
            });
          }, error => {
            alert('Error requesting Re-Attestation. If this happens repeatedly, write me at human@flowcrypt.com. Error message:\n\n' + JSON.stringify(error.message));
          });
        }, error => {
          catcher.report('Error signing REQUEST_REPLACEMENT: ' + error.message);
          alert('Error signing request. If this happens repeatedly, write me at human@flowcrypt.com. Error message:\n\n' + JSON.stringify(error.message));
        });
      }
    }));
  }
});
