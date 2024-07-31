// ==UserScript==
// @name        Artlist DL Rewrite
// @namespace   http://tampermonkey.net/
// @description Allows you to download artlist.io Music & SFX
// @author      Mia @ github.com/xNasuni
// @match       *://*.artlist.io/*
// @grant       none
// @version     2
// @run-at		document-start
// @updateURL   https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @downloadURL https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @supportURL  https://github.com/xNasuni/artlist-downloader/issues
// ==/UserScript==

const LoadedSongLists = []
const LoadedSfxLists = []
const ModifiedMusicButtonColor = "#82ff59"
const ModifiedSfxButtonColor = "#ff90bf"
const ErrorButtonColor = "#ff3333"
const MUSIC_DATATYPE = "_music"
const SFX_DATATYPE = "_sfx"

var AudioTable
var TBody
var LastChangeObserver
var LastInterval = -1
var LastPath = location.pathname

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

function MatchURL(Url) {
	var URLObject
	try {
		URLObject = new URL(Url)
	} catch (e) {
		return false
	}
	if (URLObject.host == "search-api.artlist.io" && (URLObject.pathname == "/v1/graphql" || URLObject.pathname == "/v2/graphql")) {
		return true
	}
	return false
}

function AreWeOnSFXPage() {
	if (window.location.host == "artlist.io" && window.location.pathname == "/sfx") {
		return true
	}
	return false
}

function GetDatatype(Data) {
	var Datatype = 'unknown'

	try {
		if (Data.data.sfxList != undefined && Data.data.sfxList.songs != undefined) {
			Datatype = SFX_DATATYPE
		}
	} catch (e) { }
	try {
		if (Data.data.songList != undefined && Data.data.songList.songs != undefined) {
			Datatype = MUSIC_DATATYPE
		}
	} catch (e) { }

	return Datatype
}

function GetAudioTable() {
	const TableElements = window.document.querySelectorAll(".w-full .table-fixed")
	for (const Element of TableElements) {
		if (Element.getAttribute('data-testid') == "AudioTable") {
			return Element
		}
	}
}

function GetTBody(AudioTable) {
	var TBody = undefined
	for (const Child of AudioTable.childNodes) {
		if (Child.nodeName === "TBODY") {
			TBody = Child
			break
		}
	}
	return TBody
}

function GetAudioRowData(AudioRow, Datatype) {
	var Data = { SongTitle: "none", Artists: [], Button: "none", Datatype: Datatype }
	for (const Child of AudioRow.childNodes) {
		if (Child.getAttribute("data-testid") == "AlbumsAndArtists") {
			try { // still using this method, because I couldn't find any other way to get the album title through just straight up HTML.
				Data.SongTitle = Child.childNodes[0].childNodes[2].childNodes[0].childNodes[0].childNodes[0].childNodes[0].textContent
			} catch (e) { console.warn("SongTitle: ", Child, e) }
			try { // still using this method, because I couldn't find any other way to get the album title through just straight up HTML.
				const ArtistsContainer = Child.childNodes[0].childNodes[2].childNodes[1].childNodes[0].childNodes[0].childNodes
				for (const Artist of ArtistsContainer) {
					Data.Artists.push(Artist.textContent.trim().replaceAll(",", ""))
				}
			} catch (e) { console.warn("ArtistsContainer: ", e) }
		}
		if (Child.getAttribute("data-testid") == "DataAndActions" && Datatype == MUSIC_DATATYPE) {
			try { // still using this method, because I couldn't find any other way to get the album title through just straight up HTML.
				Data.Button = Child.childNodes[0].childNodes[4].childNodes[0].childNodes[0].childNodes[0]
			} catch (e) { console.warn("Button: ", Child, e) }
		}
		if (Child.getAttribute("data-testid") == "DataAndActions" && Datatype == SFX_DATATYPE) {
			try { // still using this method, because I couldn't find any other way to get the album title through just straight up HTML.
				Data.Button = Child.childNodes[0].childNodes[2].childNodes[0].childNodes[0].childNodes[0]
			} catch (e) { console.warn("Button: ", Child, e) }
		}
	}

	if (Data.SongTitle == "none" && Data.Artists.length == 0 && Data.Button == "none") {
		// throw new ReferenceError("audio row doesn't have any data")
		return false
	}
	if ((Data.SongTitle == "none" || Data.Artists.length == 0) && Data.Button != "none") {
		Data.Button.style.color = ErrorButtonColor
	}

	return Data
}

function MakeFilename(AssetData, Datatype) {
	return `${Datatype == MUSIC_DATATYPE ? "Music" : "Sfx"} ${AssetData.artistName} - ${AssetData.songName} ${AssetData.songName != AssetData.albumName ? `on ${AssetData.albumName}` : ''} (${AssetData.artistId}.${AssetData.albumId}.${AssetData.songId})`
}

function WriteAudio(RowData, AudioData) {
	const Datatype = RowData.Datatype
	const FileName = MakeFilename(AudioData, Datatype)
	RowData.Button.setAttribute("artlist-dl", "modified")
	RowData.Button.style.color = Datatype == MUSIC_DATATYPE ? ModifiedMusicButtonColor : ModifiedSfxButtonColor
	RowData.Button.addEventListener("click", function(event) {
		event.stopImmediatePropagation() // prevent premium popup upsell
		ShowSaveFilePickerForURL(AudioData.sitePlayableFilePath, FileName + ".aac");
	}, true)
}

function MatchAudioToRow(AudioData, RowData) {
	return AudioData.songName === RowData.SongTitle && RowData.Artists.indexOf(AudioData.artistName) != -1
}

function OnRowAdded(AudioRow, RowData, AudioData) {
	AudioRow.setAttribute("artlist-dl-state", "modified")
	if (AudioData !== undefined ){
		WriteAudio(RowData, AudioData)
	} else {
		console.warn("No data given for row", RowData)
		if (RowData.Button !== "none") {
			RowData.Button.style.color = ErrorButtonColor
		}
	}
}

function GetAudioDataFromRowData(RowData) {
	if (RowData.Datatype == SFX_DATATYPE) {
		if (LoadedSfxLists.length <= 0) { console.warn("No loaded sound effects to loop through."); return }
		for (const SfxList of LoadedSfxLists) {
			for (const SfxData of SfxList) {
				if (MatchAudioToRow(SfxData, RowData)) {
					return SfxData
				}
			}
		}
	}
	if (RowData.Datatype == MUSIC_DATATYPE) {
		if (LoadedSongLists.length <= 0) { console.warn("No loaded songs to loop through."); return }
		for (const SongList of LoadedSongLists) {
			for (const SongData of SongList) {
				if (MatchAudioToRow(SongData, RowData)) {
					return SongData
				}
			}
		}
	}
}

function ApplyXHR(XHR) {
	XHR.addEventListener("readystatechange", function () {
		if (XHR.readyState == XMLHttpRequest.DONE) {
			var JSONData
			try {
				JSONData = JSON.parse(XHR.responseText)
			} catch (e) {
				console.warn(`Couldn't parse ${XHR.responseText}`)
				return
			}
			HandleJSONData(JSONData)
		}
	})
}

function HandleJSONData(Data) {
	const Datatype = GetDatatype(Data)
	if (Datatype == MUSIC_DATATYPE) {
		LoadedSongLists.push(Data.data.songList.songs)
		return
	}
	if (Datatype == SFX_DATATYPE) {
		LoadedSfxLists.push(Data.data.sfxList.songs)
		return
	}
}

const oldXMLHttpRequestOpen = window.XMLHttpRequest.prototype.open
window.XMLHttpRequest.prototype.open = function () {
	const Method = (arguments)[0]
	const URL = (arguments)[1]

	if (MatchURL(URL)) {
		ApplyXHR(this)
	}

	return oldXMLHttpRequestOpen.apply(this, arguments)
}

// this makes the user-script support the [←] Back and [→] Right navigations
// aswell as switching pages because artlist doesn't navigate, but instead
// changes their HTML dynamically so that the end-user does not have to
// reload the entire page.

// by polling the changes in an albeit bad way, we can detect when this
// occurs, and as far as i know there's no other better way to do it.
// please make an issue on github and educate me if there is.
function Initialize() {
	LastPath = location.pathname

	AudioTable = GetAudioTable()
	while (AudioTable === undefined) {
		AudioTable = GetAudioTable()
		if (AudioTable != undefined) {
			break
		}
	}

	TBody = GetTBody(AudioTable)
	while (TBody === undefined) {
		TBody = GetTBody(AudioTable)
		if (TBody != undefined) {
			break
		}
	}

	function OnAudioRowAdded(AudioRow) {
		if (AudioRow.getAttribute("artlist-dl-state") === "modified") { return }
		if (AudioRow.classList <= 0 || AudioRow.classList.contains("hidden")) { return }
		const RowData = GetAudioRowData(AudioRow, AreWeOnSFXPage() ? SFX_DATATYPE : MUSIC_DATATYPE)
		const AudioData = GetAudioDataFromRowData(RowData)
		
		OnRowAdded(AudioRow, RowData, AudioData)
	}

	LastChangeObserver = new MutationObserver(function(MutationList, _Observer) {
		for (const Mutation of MutationList) {
			if (Mutation.type === "childList" && Mutation.target == TBody) {
				for (const AudioRow of Mutation.addedNodes) {
					OnAudioRowAdded(AudioRow)
				}
			}
		}
	})

	LastChangeObserver.observe(TBody, {
		attributes: false,
		childList: true,
		subtree: true,
	})

	for (const AudioRow of TBody.childNodes) {
		OnAudioRowAdded(AudioRow)
	}
}
document.addEventListener("DOMContentLoaded", (event) => {
	Initialize()
	LastInterval = setInterval(() => {
		const NowPath = location.pathname
		if (LastPath != NowPath) {
			if (!document.contains(TBody)) {
				TBody = null
				AudioTable = null
				LastChangeObserver.disconnect()
				Initialize()
			}
			return
		}
		LastPath = NowPath
	})
})
