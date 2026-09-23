export interface FfprobeResult {
	readonly streams: Stream[];
	readonly format: Format;
}

export interface Format {
	readonly filename: string;
	readonly nb_streams: number;
	readonly nb_programs: number;
	readonly nb_stream_groups: number;
	readonly format_name: string;
	readonly format_long_name: string;
	readonly start_time: string;
	readonly duration: string;
	readonly size: string;
	readonly bit_rate: string;
	readonly probe_score: number;
	readonly tags: FormatTags;
}

export interface FormatTags {
	readonly title: string;
	readonly encoder: string;
}

export interface Stream {
	readonly index: number;
	readonly codec_name: string;
	readonly codec_long_name: string;
	readonly profile?: string;
	readonly codec_type: string;
	readonly codec_tag_string: string;
	readonly codec_tag: string;
	readonly width?: number;
	readonly height?: number;
	readonly coded_width?: number;
	readonly coded_height?: number;
	readonly has_b_frames?: number;
	readonly sample_aspect_ratio?: string;
	readonly display_aspect_ratio?: string;
	readonly pix_fmt?: string;
	readonly level?: number;
	readonly chroma_location?: string;
	readonly field_order?: string;
	readonly refs?: number;
	readonly is_avc?: string;
	readonly nal_length_size?: string;
	readonly r_frame_rate: string;
	readonly avg_frame_rate: string;
	readonly time_base: string;
	readonly start_pts: number;
	readonly start_time: string;
	readonly bits_per_raw_sample?: string;
	readonly extradata_size: number;
	readonly disposition: Disposition;
	readonly tags: StreamTags;
	readonly sample_fmt?: string;
	readonly sample_rate?: string;
	readonly channels?: number;
	readonly channel_layout?: string;
	readonly bits_per_sample?: number;
	readonly initial_padding?: number;
	readonly duration_ts?: number;
	readonly duration?: string;
}

export interface Disposition {
	readonly default: number;
	readonly dub: number;
	readonly original: number;
	readonly comment: number;
	readonly lyrics: number;
	readonly karaoke: number;
	readonly forced: number;
	readonly hearing_impaired: number;
	readonly visual_impaired: number;
	readonly clean_effects: number;
	readonly attached_pic: number;
	readonly timed_thumbnails: number;
	readonly non_diegetic: number;
	readonly captions: number;
	readonly descriptions: number;
	readonly metadata: number;
	readonly dependent: number;
	readonly still_image: number;
	readonly multilayer: number;
}

export interface StreamTags {
	readonly BPS?: string;
	readonly DURATION?: string;
	readonly NUMBER_OF_FRAMES?: string;
	readonly NUMBER_OF_BYTES?: string;
	readonly _STATISTICS_WRITING_APP?: string;
	readonly _STATISTICS_WRITING_DATE_UTC?: string;
	readonly _STATISTICS_TAGS?: string;
	readonly language?: string;
	readonly filename?: string;
	readonly mimetype?: string;
}
