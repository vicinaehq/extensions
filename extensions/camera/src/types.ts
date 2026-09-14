export type CameraDevice = {
	path: string;
	label: string;
};

export type Resolution = "auto" | "640x480" | "1280x720" | "1920x1080";

export type Preferences = {
	save_directory: string;
	resolution: Resolution;
	copy_to_clipboard: boolean;
	open_after_capture: boolean;
};

export type TakePhotoPreferences = Preferences & {
	default_device: string;
};
