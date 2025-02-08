export type MusicTrack = {
	id: string;
	realId: string;
	title: string;
	contentWarning?: string;
	major: {
		id: number;
		name: string;
	};
	available: boolean;
	availableForPremiumUsers: boolean;
	availableFullWithoutPermission: boolean;
	availableForOptions: string[];
	disclaimers: string[];
	storageDir: string;
	durationMs: number;
	fileSize: number;
	r128: {
		i: number;
		tp: number;
	};
	fade: {
		inStart: number;
		inStop: number;
		outStart: number;
		outStop: number;
	};
	previewDurationMs: number;
	artists: MusicArtist[];
	albums: MusicAlbum[];
	coverUri: string;
	derivedColors: {
		average: string;
		waveText: string;
		miniPlayer: string;
		accent: string;
	};
	ogImage: string;
	lyricsAvailable: boolean;
	type: string;
	rememberPosition: boolean;
	shortDescription?: string;
	isSuitableForChildren?: boolean;
	pubDate?: string;
	trackSharingFlag: string;
	lyricsInfo: {
		hasAvailableSyncLyrics: boolean;
		hasAvailableTextLyrics: boolean;
	};
	trackSource: string;
	specialAudioResources?: string[];
};

export type MusicArtist = {
	id: number;
	name: string;
	various: boolean;
	composer: boolean;
	available: boolean;
	cover: {
		type: string;
		uri: string;
		prefix: string;
	};
	genres: unknown[];
	disclaimers: unknown[];
};

export type MusicAlbum = {
	id: number;
	title: string;
	type: string;
	metaType: string;
	year?: number;
	releaseDate?: string;
	contentWarning?: string;
	coverUri: string;
	ogImage: string;
	genre?: string;
	trackCount: number;
	likesCount: number;
	childContent?: boolean;
	recent: boolean;
	veryImportant: boolean;
	artists: MusicArtist[];
	labels: Array<{
		id: number;
		name: string;
	}>;
	available: boolean;
	availableForPremiumUsers: boolean;
	availableForOptions: string[];
	availableForMobile: boolean;
	availablePartially: boolean;
	bests: number[];
	shortDescription?: string;
	description?: string;
	disclaimers: string[];
	listeningFinished: boolean;
	trackPosition: {
		volume: number;
		index: number;
	};
};

export type MusicLike = {
	id: string;
	albumId: string;
	timestamp: string;
};
