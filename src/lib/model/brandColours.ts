// Scouts Australia's colours, from the Brand Book (August 2026, section 14, "Our Colours"), on the
// Brand Centre: https://scouts.com.au/members/resources/brand/. Used where Beacon prints something
// that goes home, like progress reports; the app itself keeps the phone's own colours.

/** The base colours: Australian Navy Blue (PMS 280c), the brand's core colour, and Dark Grey for type */
export const SCOUTS_NAVY = '#28265c';
export const SCOUTS_DARK_GREY = '#575756';

export interface SectionColours {
	/** The section's primary colour (e.g. Scouts Cubs Yellow, PMS 123c), for bars and fills */
	primary: string;
	/** The darkest shade in the section's palette, dark enough for text and ticks on white */
	dark: string;
}

/** Each section's palette (section 14.3): its primary colour and its darkest shade */
export const SECTION_COLOURS: Record<string, SectionColours> = {
	// Scouts Joeys Brown, PMS 471c; PMS 1675c
	joey: { primary: '#ba6228', dark: '#973d20' },
	// Scouts Cubs Yellow, PMS 123c; PMS 146c
	cub: { primary: '#ffc62e', dark: '#946a28' },
	// Scouts Scouts Green, PMS 354c; PMS 349c
	scout: { primary: '#0cae4b', dark: '#066d3c' },
	// Scouts Venturer, PMS 201c; PMS 188c
	venturer: { primary: '#a22237', dark: '#701d28' },
	// Scouts Rover Red, PMS 485c; Rover Burgundy, PMS 7622c
	rover: { primary: '#de2a26', dark: '#9a2320' }
};

/** A section's colours; with none known, the brand's own Scouts Medium Blue (PMS 7684c) and navy */
export const sectionColours = (section: string): SectionColours =>
	SECTION_COLOURS[section] ?? { primary: '#3d5c93', dark: SCOUTS_NAVY };
