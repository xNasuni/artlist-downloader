// ==UserScript==
// @name        Artlist DL
// @namespace   http://tampermonkey.net/
// @description Allows you to download artlist.io Music & SFX
// @author      Mia @ github.com/xNasuni
// @match       *://*.artlist.io/*
// @grant       none
// @version     2.2
// @run-at	    document-start
// @updateURL   https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @downloadURL https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @supportURL  https://github.com/xNasuni/artlist-downloader/issues
// ==/UserScript==

const LoadedMusicLists = []
const LoadedSfxLists = []
const LoadedSfxsList = []
const LoadedSongsList = []
const ModifiedMusicButtonColor = "#82ff59"
const ModifiedSfxButtonColor = "#ff90bf"
const ErrorButtonColor = "#ff3333"
const UNKNOWN_DATATYPE = "_unknown"
const SINGLE_SOUND_EFFECT_DATATYPE = "_ssfx"
const SINGLE_SONG_DATATYPE = "_ssong"
const SONGS_PAGETYPE = "_songs"
const MUSIC_PAGETYPE = "_music"
const SFXS_PAGETYPE = "_sfxs"
const SFX_PAGETYPE = "_sfx"
const oldXMLHttpRequestOpen = window.XMLHttpRequest.prototype.open

var AudioTable
var TBody
var LastChangeObserver
var ActionContainer
var SongPage
var LastInterval = -1
var RequestsInterval = -1
var DontPoll = false
var SingleSoundEffectData = "none"
var SingleSongData = "none"

async function ShowSaveFilePickerForURL(url, filename) {
	if (window.showSaveFilePicker == undefined) {
		// show save file picker might not always exist for compatability.
		location.href = url;
		return;
	}

	let blobDataFromURL = await fetch(url).then((r) => r.blob());

	try {
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
	} catch (e) { }
}

function Until(testFunc) {
	// https://stackoverflow.com/a/52657929
	const poll = (resolve) => {
		if (DontPoll) { resolve() }
		if (testFunc()) {
			resolve();
		} else setTimeout((_) => poll(resolve), 100);
	};
	return new Promise(poll)
}

function GetPagetype() {
	const PathSplit = window.location.pathname.split('/')
	if (window.location.host === "artlist.io" && (PathSplit[1] === "royalty-free-music" && (PathSplit[2] === "song" || PathSplit[2] === "artist"))) {
		return SONGS_PAGETYPE
	}
	if (window.location.host === "artlist.io" && (PathSplit[1] === "royalty-free-music")) {
		return MUSIC_PAGETYPE
	}
	if (window.location.host === "artlist.io" && (PathSplit[1] === "sfx" && PathSplit[2] === "track")) {
		return SFXS_PAGETYPE
	}
	if (window.location.host == "artlist.io" && (PathSplit[1] === "sfx" || (PathSplit[1] === "sfx" && (PathSplit[2] === "search" || PathSplit[2] === "pack")))) {
		return SFX_PAGETYPE
	}
	return UNKNOWN_DATATYPE
}

function GetDatatype(Data) {
	var Datatype = UNKNOWN_DATATYPE

	try {
		if (Data.data.sfxList != undefined && Data.data.sfxList.songs != undefined) {
			Datatype = SFX_PAGETYPE
		}
	} catch (e) { }
	try {
		if (Data.data.songList != undefined && Data.data.songList.songs != undefined) {
			Datatype = MUSIC_PAGETYPE
		}
	} catch (e) { }
	try {
		if (Data.data.sfxs != undefined && Data.data.sfxs.length === 1 && Data.data.sfxs[0].similarList != undefined) {
			Datatype = SFXS_PAGETYPE
		}
	} catch (e) { }
	try {
		if (Data.data.sfxs != undefined && Data.data.sfxs.length === 1 && Data.data.sfxs[0].songName != undefined) {
			Datatype = SINGLE_SOUND_EFFECT_DATATYPE
		}
	} catch (e) { }
	try {
		if (Data.data.songs != undefined && Data.data.songs.length === 1 && Data.data.songs[0].songName != undefined) {
			Datatype = SINGLE_SONG_DATATYPE
		}
	} catch (e) { }
	try {
		if (Data.data.songs != undefined && Data.data.songs.length === 1 && Data.data.songs[0].similarSongs != undefined) {
			Datatype = SONGS_PAGETYPE
		}
	} catch (e) { }

	return Datatype
}

function MatchURL(Url) {
	const Pagetype = GetPagetype()
	var URLObject
	try {
		URLObject = new URL(Url)
	} catch (e) {
		return false
	}
	if ((Pagetype === MUSIC_PAGETYPE || Pagetype === SFX_PAGETYPE || Pagetype === SONGS_PAGETYPE || Pagetype === SFXS_PAGETYPE) && URLObject.host === "search-api.artlist.io" && (URLObject.pathname == "/v1/graphql" || URLObject.pathname == "/v2/graphql")) {
		return true
	}
	return false
}

async function GetSfxInfo(Id) {
	const Query = `query Sfxs($ids: [Int!]!) {
  sfxs(ids: $ids) {
    songId
    songName
    artistId
    artistName
    albumId
    albumName
    assetTypeId
    duration
    sitePlayableFilePath
  }
}
`
	const Variables = {ids: [Id]}

	const Payload = {query: Query, variables: Variables}

	const Response = await fetch("https://search-api.artlist.io/v1/graphql", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(Payload)})
	const JSONData = await Response.json()

	var Data

	try {
		Data = JSONData.data.sfxs[0]
	} catch (e) { }

	if (Data === undefined) {
		return false
	}

	return Data
}

async function GetSongInfo(Id) {
	const Query = `query Songs($ids: [String!]!) {
  songs(ids: $ids) {
    songId
    songName
    artistId
    artistName
    albumId
    albumName
    assetTypeId
    duration
    sitePlayableFilePath
  }
}
`
	const Variables = {ids: [Id.toString()]}

	const Payload = {query: Query, variables: Variables}

	const Response = await fetch("https://search-api.artlist.io/v1/graphql", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(Payload)})
	const JSONData = await Response.json()

	var Data

	try {
		Data = JSONData.data.songs[0]
	} catch (e) { }

	if (Data === undefined) {
		return false
	}
	
	return Data
}

async function LoadAssetInfo(Id) {
	const Pagetype = GetPagetype()
	if (Pagetype === SFXS_PAGETYPE) {
		SingleSoundEffectData = await GetSfxInfo(Id)
		return true
	}
	if (Pagetype === SONGS_PAGETYPE) {
		SingleSongData = await GetSongInfo(Id)
		return true
	}
	return false
}

function GetAudioTable() {
	return window.document.querySelector("table.w-full.table-fixed[data-testid=AudioTable]")
}

function GetSongPage() {
	return window.document.querySelector("div[data-testid=SongPage]")
}

function GetBanner(SongPage) {
	return SongPage.querySelector("div.relative.h-banner.min-h-95.w-full")
}

function GetActionRow(SongPage) {
	if (window.innerWidth >= 1024) {
		return SongPage.querySelector("div.hidden")
	}
	return SongPage.querySelector("div.block.py-4.px-6")
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

function GetTBodyEdgeCase() {
	const TBody = window.document.querySelector("div[data-testid=Wrapper]") || window.document.querySelector("div[data-testid=ArtistContent]")
	if (TBody === null) {
		return
	}
	if (TBody.parentNode.classList.contains("hidden")) {
		return
	}
	return TBody
}

function GetAudioRowData(AudioRow, Pagetype) {
	var Data = { AudioTitle: "none", Artists: [], Button: "none", Pagetype: Pagetype }
	var AlbumsAndArtists = AudioRow.querySelector("td[data-testid=AlbumsAndArtists]")
	var DataAndActions = AudioRow.querySelector("td[data-testid=DataAndActions]")

	if (Pagetype === SONGS_PAGETYPE) {
		AlbumsAndArtists = AudioRow.querySelector("div[data-testid=AudioDetails]")
		DataAndActions = AudioRow.querySelector("div[data-testid=AnimatedToggleContainer]")
	}

	if (AlbumsAndArtists === null || DataAndActions === null) {
		return Data
	}

	const AudioTitle = AlbumsAndArtists.querySelector("a.truncate[data-testid=Link]")
	const Artists = AlbumsAndArtists.querySelectorAll("a.truncate.whitespace-pre.font-normal[data-testid=Link]")
	const Button = DataAndActions.querySelector("button[aria-label='download']") || DataAndActions.querySelector("button[aria-label='Download']")

	if (AudioTitle) {
		Data.AudioTitle = AudioTitle.textContent.trim()
	}
	if (Artists) {
		for (const Artist of Artists) {
			Data.Artists.push(Artist.textContent.replaceAll(",", "").trim())
		}
	}
	if (Button) {
		Data.Button = Button
	}

	if (Data.AudioTitle === "none" && Data.Artists.length === 0 && Data.Button === "none") {
		return false
	}
	if ((Data.AudioTitle === "none" || Data.Artists.length === 0) && Data.Button !== "none") {
		Data.Button.style.color = ErrorButtonColor
	}

	return Data
}

function GetBannerData(SongPage, Pagetype) {
	const Data = { AudioTitle: "none", Artists: [], Button: "none", Pagetype: Pagetype }
	
	const Banner = GetBanner(SongPage)
	const ActionRow = GetActionRow(SongPage)

	if (Banner === null || ActionRow === null) {
		return false
	}

	const Title = Banner.querySelector("h1[data-testid=Heading]")
	const Artists = Banner.querySelectorAll("a[data-testid=Link]")
	const Button = ActionRow.querySelector("button[aria-label='direct download']")

	if (Title === null || Artists.length <= 0 || Button === null) {
		return Data
	}

	Data.AudioTitle = Title.textContent
	Data.Button = Button
	
	for (const Artist of Artists) {
		Data.Artists.push(Artist.textContent.replaceAll(",", "").trim())
	}
	
	if (Data.AudioTitle === "none" && Data.Artists.length == 0 && Data.Button === "none") {
		return false
	}
	if ((Data.AudioTitle === "none" || Data.Artists.length == 0) && Data.Button != "none") {
		Data.Button.style.color = ErrorButtonColor
		Data.Button.style.borderColor = ErrorButtonColor
	}

	return Data
}

function MakeFilename(AssetData, Pagetype) {
	const NoAlbum = AssetData.albumId === undefined
	return `${(Pagetype === MUSIC_PAGETYPE || Pagetype === SONGS_PAGETYPE) ? "Music" : "Sfx"} ${AssetData.artistName} - ${AssetData.songName} ${AssetData.songName != AssetData.albumName ? `on ${AssetData.albumName} ` : ''}(${AssetData.artistId}.${NoAlbum ? '' : AssetData.albumId + '.'}${AssetData.songId})`
}

function WriteAudio(RowData, AudioData) {
	const Pagetype = RowData.Pagetype
	const ChosenColor = (Pagetype === MUSIC_PAGETYPE || Pagetype === SONGS_PAGETYPE) ? ModifiedMusicButtonColor : ModifiedSfxButtonColor
	const FileName = MakeFilename(AudioData, Pagetype)
	RowData.Button.setAttribute("artlist-dl", "modified")
	RowData.Button.style.color = ChosenColor
	RowData.Button.addEventListener("click", function (event) {
		event.stopImmediatePropagation() // prevent premium popup upsell
		ShowSaveFilePickerForURL(AudioData.sitePlayableFilePath, FileName + ".aac");
	}, true)
}

function WriteBanner(BannerData, AudioData) {
	const Pagetype = BannerData.Pagetype
	const ChosenColor = (Pagetype === MUSIC_PAGETYPE || Pagetype === SONGS_PAGETYPE) ? ModifiedMusicButtonColor : ModifiedSfxButtonColor
	const FileName = MakeFilename(AudioData, Pagetype)
	BannerData.Button.setAttribute("artlist-dl", "modified")
	BannerData.Button.style.color = ChosenColor
	BannerData.Button.style.borderColor = ChosenColor
	BannerData.Button.addEventListener("click", function (event) {
		event.stopImmediatePropagation() // prevent premium popup upsell
		ShowSaveFilePickerForURL(AudioData.sitePlayableFilePath, FileName + ".aac");
	}, true)
}

function MatchAudioToRow(AudioData, RowData) {
	return AudioData.songName.trim() === RowData.AudioTitle.trim() && RowData.Artists.indexOf(AudioData.artistName.trim()) != -1
}

function OnRowAdded(AudioRow, RowData, AudioData) {
	AudioRow.setAttribute("artlist-dl-state", "modified")
	if (AudioData !== undefined) {
		WriteAudio(RowData, AudioData)
	} else {
		console.warn("No data given for row", RowData)
		if (RowData.Button !== "none") {
			RowData.Button.style.color = ErrorButtonColor
		}
	}
}

function GetAudioDataFromRowData(RowData) {
	if (RowData.Pagetype === SFX_PAGETYPE) {
		if (LoadedSfxLists.length <= 0) { console.warn("No loaded sound effects to loop through."); return }
		for (const SfxList of LoadedSfxLists) {
			for (const SfxData of SfxList) {
				if (MatchAudioToRow(SfxData, RowData)) {
					return SfxData
				}
			}
		}
	}
	if (RowData.Pagetype === MUSIC_PAGETYPE) {
		if (LoadedMusicLists.length <= 0) { console.warn("No loaded songs to loop through."); return }
		for (const MusicList of LoadedMusicLists) {
			for (const SongData of MusicList) {
				if (MatchAudioToRow(SongData, RowData)) {
					return SongData
				}
			}
		}
	}
	if (RowData.Pagetype === SFXS_PAGETYPE) {
		if (LoadedSfxsList.length <= 0) { console.warn("No loaded similar sfxs to loop through."); return }
		for (const SfxsList of LoadedSfxsList) {
			for (const SfxData of SfxsList) {
				if (MatchAudioToRow(SfxData, RowData)) {
					return SfxData
				}
			}
		}
	}
	if (RowData.Pagetype === SONGS_PAGETYPE) {
		if (LoadedSongsList.length <= 0) { console.warn("No loaded similar songs to loop through."); return }
		for (const SongsList of LoadedSongsList) {
			for (const SongData of SongsList) {
				if (MatchAudioToRow(SongData, RowData)) {
					return SongData
				}
			}
		}
	}
	
	console.warn("Couldn't handle data:", RowData)
}

function ApplyXHR(XHR) {
	const Pagetype = GetPagetype()

	if (Pagetype !== UNKNOWN_DATATYPE) {
		XHR.addEventListener("readystatechange", function () {
			if (XHR.readyState == XMLHttpRequest.DONE) {
				var JSONData
				try {
					JSONData = JSON.parse(XHR.responseText)
				} catch (e) {
					console.warn(`Couldn't parse as json: ${XHR.responseText}`)
					return
				}
				HandleJSONData(JSONData)
			}
		})
	}
}

function HandleJSONData(Data) {
	const Datatype = GetDatatype(Data)
	if (Datatype === SONGS_PAGETYPE) {
		LoadedSongsList.push(Data.data.songs[0].similarSongs)
	}
	if (Datatype === MUSIC_PAGETYPE) {
		LoadedMusicLists.push(Data.data.songList.songs)
	}
	if (Datatype === SFXS_PAGETYPE) {
		LoadedSfxsList.push(Data.data.sfxs[0].similarList)
	}
	if (Datatype === SFX_PAGETYPE) {
		LoadedSfxLists.push(Data.data.sfxList.songs)
	}
}

function HookRequests() {
	if (RequestsInterval != -1) {
		clearInterval(RequestsInterval)
	}
	RequestsInterval = setInterval(() => {
		window.XMLHttpRequest.prototype.open = function() {
			const Method = (arguments)[0]
			const URL = (arguments)[1]
	
			if (MatchURL(URL)) {
				ApplyXHR(this)
			}
	
			return oldXMLHttpRequestOpen.apply(this, arguments)
		}
	})
}

// this makes the user-script support the [←] Back and [→] Right navigations
// aswell as switching pages because artlist doesn't navigate, but instead
// changes their HTML dynamically so that the end-user does not have to
// reload the entire page.

// by polling the changes in an albeit bad way, we can detect when this
// occurs, and as far as i know there's no other better way to do it.
// please make an issue on github and educate me if there is.

async function Initialize() {
	DontPoll = false

	const Pagetype = GetPagetype()

	console.log("searching for table...")

	if (Pagetype === SONGS_PAGETYPE || Pagetype === SFXS_PAGETYPE) {
		const Id = location.pathname.split("/")[4]
		const NumId = new Number(Id)
		if (NumId.toString() !== "NaN") {
			LoadAssetInfo(NumId)
		}
		SongPage = GetSongPage()
		await Until(() => {
			const Data = GetBannerData(SongPage, Pagetype)
			return Data != false && Data.Button != "none"
		})
		const RowData = GetBannerData(SongPage, Pagetype)
		await Until(() => {
			return Pagetype === SONGS_PAGETYPE ? SingleSongData != "none" : SingleSoundEffectData != "none"
		})
		const AudioData = Pagetype === SONGS_PAGETYPE ? SingleSongData : SingleSoundEffectData
		if (RowData.AudioTitle && RowData.Artists.length >= 1) {
			WriteBanner(RowData, AudioData)
		}
	}

	if (Pagetype === SONGS_PAGETYPE) {
		await Until(() => {
			return GetTBodyEdgeCase() != undefined
		})
		TBody = GetTBodyEdgeCase()
	} else {
		await Until(() => {
			return GetAudioTable() != undefined
		})
		AudioTable = GetAudioTable()
		console.log("table", AudioTable)
	
		await Until(() => {
			return GetTBody(AudioTable) != undefined
		})
		TBody = GetTBody(AudioTable)
		console.log("tbody", TBody)
	}

	function OnAudioRowAdded(AudioRow) {
		if (AudioRow.getAttribute("artlist-dl-state") === "modified") { return }
		if ((Pagetype !== SONGS_PAGETYPE && AudioRow.classList <= 0) || AudioRow.classList.contains("hidden")) { return }
		const RowData = GetAudioRowData(AudioRow, GetPagetype())
		const AudioData = GetAudioDataFromRowData(RowData)

		OnRowAdded(AudioRow, RowData, AudioData)
	}

	LastChangeObserver = new MutationObserver(function (MutationList, _Observer) {
		for (const Mutation of MutationList) {
			if (Mutation.type === "childList" && Mutation.target == TBody) {
				for (const AudioRow of Mutation.addedNodes) {
					OnAudioRowAdded(AudioRow)
				}
			}
		}
	})

	LastChangeObserver.observe(TBody, {
		attributes: true,
		childList: true,
		subtree: true,
	})
	console.log("called observer")

	for (const AudioRow of TBody.childNodes) {
		OnAudioRowAdded(AudioRow)
	}
}

HookRequests()
document.addEventListener("DOMContentLoaded", () => {
	Initialize()
	LastInterval = setInterval(() => {
		if (TBody != null && !document.contains(TBody)) {
			console.log("Re-updating...")
			DontPoll = true
			TBody = null
			AudioTable = null
			SongPage = null
			try { LastChangeObserver.disconnect() } catch(e){  }
			Initialize()
		}
	})
})
