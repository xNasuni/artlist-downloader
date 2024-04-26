// ==UserScript==
// @name        Artlist DL
// @namespace   http://tampermonkey.net/
// @description Allows you to download artlist.io Music & SFX
// @author      Mia @ github.com/xNasuni
// @match       *://*.artlist.io/*
// @grant       none
// @version     1.6
// @updateURL   https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @downloadURL https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @supportURL  https://github.com/xNasuni/artlist-downloader/issues
// ==/UserScript==

const readyButtonColor = "#aaff55";
registered = {}; // {`${artistName},${songName}`: <function>}}
pageIsSFX = location.pathname.includes("sfx");

function until(testFunc) {
  // https://stackoverflow.com/a/52657929
  const poll = (resolve) => {
    if (testFunc()) {
      resolve();
    } else setTimeout((_) => poll(resolve), 800);
  };

  return new Promise(poll);
}

function GetDownloadElementFromDetails(Title, Author) {
  // this shouldn't break, atleast for like a couple site updates...
  const Authors = document.getElementsByClassName(
    "truncate whitespace-pre font-normal"
  );
  var SongDatas = [];
  for (var AuthorEl of Authors) {
    if (
      AuthorEl.innerText.toLowerCase().includes(Author.toLowerCase()) &&
      !AuthorEl.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.className.includes(
        "sticky bottom-0 z-50 mt-25 w-full bg-primary py-5" // really unreadable code
      )
    ) {
      SongDatas.push({
        author: AuthorEl,
        title:
          AuthorEl.parentNode.parentNode.parentNode.parentNode.children[0]
            .children[0].children[0].children[0],
        button:
          AuthorEl.parentNode.parentNode.parentNode.parentNode.parentNode
            .parentNode.parentNode.children[2].children[0].children[
            window.pageIsSFX ? 2 : 4
          ].children[0].children[0].children[0],
      }); // MOST unreadable code
    }
  }
  if (SongDatas.length <= 0) {
    return 0x1;
  }

  var TargetSongData = null;
  for (var songData of SongDatas) {
    if (songData.title.innerText.toLowerCase().includes(Title.toLowerCase())) {
      TargetSongData = songData;
    }
  }

  if (TargetSongData == null) {
    return 0x2;
  }

  var ButtonElement = null;
  if (
    TargetSongData.title.innerText.toLowerCase().includes(Title.toLowerCase())
  ) {
    ButtonElement = TargetSongData.button;
  }

  if (ButtonElement == null) {
    return 0x3;
  }
  return ButtonElement;
}

async function ShowSaveFilePickerForURL(url, filename) {
  if (window.showSaveFilePicker == undefined) {
    // show save file picker might not always exist for compatability.
    location.href = url;
    return;
  }

  let blobDataFromURL = await fetch(url).then((r) => r.blob());

  const BlobData = new Blob([blobDataFromURL], { type: "audio/aac" });
  const Handle = await window.showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: "AAC File (Compressed MP3)",
        accept: { "audio/aac": [".aac"] },
      },
    ],
  });
  const Writable = await Handle.createWritable();
  await Writable.write(BlobData);
  await Writable.close();
}

function handleButton(button, artistName, songName, url, filename) {
  try {
    button.style.color = readyButtonColor;
    function handler(event) {
      try {
        event.stopImmediatePropagation(); // prevent any other click calls getting to the premium popup upsell
      } catch (e) {}
      ShowSaveFilePickerForURL(url, filename + ".aac");
    }
    button.addEventListener("click", handler, true);
    registered[artistName + "," + songName] = handler;
  } catch (e) {} // might not be initialized, but it's better if 1 button errors and its catched
  ///////////////// rather than 1 error making all buttons not work, does that logic make sense?
}

function handleMatch(xhr) {
  async function onstatechange() {
    console.debug(xhr.readyState, xhr.status, xhr)
    if (xhr.readyState == 4 && xhr.status == 200) {
      // when the request is done, we wait for buttons to be loaded because
      // if this is the first time loading, buttons likely wont be loaded
      // as there wouldn't have been anything to display yet, which is
      // the sole reason that the website makes this call. <--- yap
      await until(() => {
        return (
          document.getElementsByClassName(
            "MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeMedium w-6 text-base text-white"
          ).length >= 1
        );
      });

      const responseText = xhr.responseText;
      const jsonData = JSON.parse(responseText);

      if (jsonData.data.sfxList != null) {
        pageIsSFX = true;
      }
      if (jsonData.data.songList != null) {
        pageIsSFX = false;
      }

      console.debug((jsonData.data.songList || jsonData.data.sfxList))
      const songs = (jsonData.data.songList || jsonData.data.sfxList).songs; // get the music or sfx as iterable json

      for (const song of songs) {
        const {
          albumId,
          artistId,
          songId,
          //   duration,
          artistName,
          //   albumName,
          songName,
          sitePlayableFilePath,
        } = song;

        if (document.getElementsByClassName("text-white rounded-full border flex w-9 h-9").length >= 1) {
          for (const roundedButton of document.getElementsByClassName("text-white rounded-full border flex w-9 h-9")) 			{
            if (roundedButton.getAttribute("aria-label") == "direct download") {
              var details = {
                title: roundedButton.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[0].children[2].children[0].children[0].children[0],
                author: roundedButton.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.children[0].children[2].children[0].children[1].children[0].children[0]
              }
              
              if (artistName.toLowerCase().includes(details.author.innerText) && songName.toLowerCase().includes(details.title.innerText)) {
                handleButton(roundedButton, artistName, songName, sitePlayableFilePath, 
          `${
            pageIsSFX ? "SFX" : "MUSIC"
          } ${artistName} - ${songName} (${artistId}.${albumId}.${songId})`)
              }
            }
          }
        }
        
        await until(() => { const typ = typeof(GetDownloadElementFromDetails(songName, artistName)) ;console.debug(typ); return typ != "number"})
        
        const button = GetDownloadElementFromDetails(songName, artistName);
        console.debug(`got button`, button)
        if (button == 0x2) {
          
        }
        handleButton(
          button,
          artistName,
          songName,
          sitePlayableFilePath,
          `${
            pageIsSFX ? "SFX" : "MUSIC"
          } ${artistName} - ${songName} (${artistId}.${albumId}.${songId})`
        ); // handle the button we got from the function
      }
    }
  }
  xhr.addEventListener("readystatechange", onstatechange);
  if (xhr.readyState == 4) {
    onstatechange();
  }
}

window.XMLHttpRequestOriginalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (method, url) {
  try {
    const ParsedURL = new URL(url);
    if (ParsedURL.host == "search-api.artlist.io") {
      // this is the url where it returns the song datas
      handleMatch(this); // `this` is equal to the xhr instance since we are in the scope of a prototype
    }
  } catch (e) {} // new URL(...) can error if XMLHttpRequest was created with diff args

  window.XMLHttpRequestOriginalOpen.apply(this, arguments);
};

async function makeNowPlayingButtonDoThings() {
  await until(() => {
    return (
      document.getElementsByClassName(
        "flex w-6 items-center justify-center text-white hover:text-accent"
      ).length >= 1
    );
  });

  const mainButton = document.getElementsByClassName(
    "flex w-6 items-center justify-center text-white hover:text-accent"
  )[0];
  mainButton.style.color = readyButtonColor;
  mainButton.addEventListener(
    "click",
    (event) => {
      event.stopImmediatePropagation(); // prevent any other click calls getting to the premium popup upsell

      const holderOfThings =
        mainButton.parentNode.parentNode.parentNode.parentNode.parentNode
          .parentNode.parentNode.children[0].children[1].children[1]
          .children[0];

      const title =
        holderOfThings.children[0].children[0].children[0].children[0]
          .innerText;
      const author =
        holderOfThings.children[1].children[0].children[0].children[0]
          .innerText;

      const thisHandler = registered[`${author},${title}`];

      if (thisHandler != null) {
        thisHandler();
      } else {
        // this if statement should never get here
        alert(
          `Please report any errors in the Dev-Tools to https://github.com/xNasuni/artlist-downloader, and also show this:\n[${author},${title}] === null, #$ = ${registered.length}`
        );
      }
    },
    true
  );
}
makeNowPlayingButtonDoThings(); // yeah im not the best at coding
