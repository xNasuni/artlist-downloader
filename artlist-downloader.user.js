// ==UserScript==
// @name        Artlist DL
// @namespace   http://tampermonkey.net/
// @description Allows you to download artlist.io Music & SFX
// @author      Mia @ github.com/xNasuni
// @match       *://*.artlist.io/*
// @grant       none
// @version     1.3
// @require https://cdn.jsdelivr.net/npm/notiflix@3.2.6/dist/notiflix-aio-3.2.6.min.js
// @updateURL   https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @downloadURL https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @supportURL  https://github.com/xNasuni/artlist-downloader/issues
// ==/UserScript==

window.XMLHttpRequestOriginalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url) {
    //console.log(`request @ ${url} | ${method}`);
  	if (url.startsWith('https://cms-public-artifacts.artlist.io/')) {
        const filename = atob(url.substring(('https://cms-public-artifacts.artlist.io/').length))
        Notiflix.Notify.success(filename, async () => {
            const link = 'https://cms-public-artifacts.artlist.io/' + filename
            
            let blobDataFromURL = await fetch(link).then(r => r.blob());
            
            const BlobData = new Blob([blobDataFromURL], { type: 'audio/aac' })
            const Handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{description: "AAC File (Compressed MP3)", accept: { "audio/aac": [".aac"]}}] })
            const Writable = await Handle.createWritable()
            await Writable.write(BlobData)
            await Writable.close()
        }, {
            distance: '60px',
            fontSize: '9px',
            closeButton: true
        });
    }
    window.XMLHttpRequestOriginalOpen.apply(this, arguments);
};
