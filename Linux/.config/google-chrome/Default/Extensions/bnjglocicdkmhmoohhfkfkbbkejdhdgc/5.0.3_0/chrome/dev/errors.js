/* Business Source License 1.0 © 2016-2017 FlowCrypt Limited. Use limitations apply. Contact human@flowcrypt.com */

'use strict';

window.flowcrypt_storage.get(null, 'errors', storage => {
  if(storage.errors && storage.errors.length) {
    var errors = ('<p>' + storage.errors.join('</p><br/><p>') + '</p>').replace(/\n/g, '<br>');
    $('.pre').html(errors);
  }
});

$('.clear').click(function () {
  window.flowcrypt_storage.remove(null, 'errors', function () {
    window.location.reload();
  });
});
