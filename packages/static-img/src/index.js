import path from 'node:path';
import { image } from './preprocessor.js';
import { get } from 'node:http';

/**
 * @param {import('../types').PluginOptions | undefined} opts
 * @returns {Promise<import('vite').Plugin[]>}
 */
export async function staticImages(opts) {
	const imagetools_plugin = await imagetools(opts);
	if (!imagetools_plugin) {
		console.error(
			'@sveltejs/static-img: vite-imagetools is not installed. Skipping build-time optimizations'
		);
	}
	return imagetools_plugin ? [image_plugin(), imagetools_plugin] : [];
}

/**
 * Creates the Svelte image plugin which provides the preprocessor.
 * @returns {import('vite').Plugin}
 */
function image_plugin() {
	const preprocessor = image();

	return {
		name: 'vite-plugin-svelte-image',
		api: {
			sveltePreprocess: preprocessor
		}
	};
}

/** @type {Record<string,string>} */
const fallback = {
	'.heic': 'jpg',
	'.heif': 'jpg',
	'.avif': 'png',
	'.jpeg': 'jpg',
	'.jpg': 'jpg',
	'.png': 'png',
	'.tiff': 'jpg',
	'.webp': 'png',
	'.gif': 'gif'
};

/**
 * @param {import('../types').PluginOptions | undefined} plugin_opts
 */
async function imagetools(plugin_opts) {
	/** @type {typeof import('vite-imagetools').imagetools} */
	let imagetools;
	try {
		({ imagetools } = await import('vite-imagetools'));
	} catch (err) {
		return;
	}

	/** @type {import('../types').PluginOptions} */
	const imagetools_opts = {
		defaultDirectives: (url) => {
			if (url.searchParams.has('static-img')) {
				/** @type {Record<string,string>} */
				const result = {
					as: 'picture'
				};
				if (url.searchParams.has('sizes')) {
					const deviceSizes = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
					const allSizes = [16, 32, 48, 64, 96, 128, 256, 384].concat(deviceSizes);
					const sizes = url.searchParams.get('sizes') ?? undefined;
					// TODO: we can't get the width right now because it's not determined until the import is loaded
					// we will need to eagerly load the import URL
					const width = '100%';
					getWidths(deviceSizes, allSizes, width, sizes);
					result.w = '';
				}
				const ext = path.extname(url.pathname);
				result.format = `avif;webp;${fallback[ext] ?? 'png'}`;
				return new URLSearchParams(result);
			}
			return url.searchParams;
		},
		...(plugin_opts || {})
	};

	// TODO: should we make formats or sizes configurable besides just letting people override defaultDirectives?
	// TODO: generate img rather than picture if only a single format is provided
	//     by resolving the directives for the URL in the preprocessor
	return imagetools(imagetools_opts);
}

/**
 * Taken under MIT license (Copyright (c) 2023 Vercel, Inc.) from
 * https://github.com/vercel/next.js/blob/3f25a2e747fc27da6c2166e45d54fc95e96d7895/packages/next/src/shared/lib/get-img-props.ts#L132
 * @param {number[]} deviceSizes
 * @param {number[]} allSizes
 * @param {number | string} width
 * @param {string | undefined} sizes
 * @returns {{ widths: number[]; kind: 'w' | 'x' }}
 */
function getWidths(deviceSizes, allSizes, width, sizes) {
	if (sizes) {
		// Find all the "vw" percent sizes used in the sizes prop
		const viewportWidthRe = /(^|\s)(1?\d?\d)vw/g;
		const percentSizes = [];
		for (let match; (match = viewportWidthRe.exec(sizes)); match) {
			percentSizes.push(parseInt(match[2]));
		}
		if (percentSizes.length) {
			const smallestRatio = Math.min(...percentSizes) * 0.01;
			return {
				widths: allSizes.filter((s) => s >= deviceSizes[0] * smallestRatio),
				kind: 'w'
			};
		}
		return { widths: allSizes, kind: 'w' };
	}
	if (typeof width !== 'number') {
		return { widths: deviceSizes, kind: 'w' };
	}

	const widths = [
		...new Set(
			// > This means that most OLED screens that say they are 3x resolution,
			// > are actually 3x in the green color, but only 1.5x in the red and
			// > blue colors. Showing a 3x resolution image in the app vs a 2x
			// > resolution image will be visually the same, though the 3x image
			// > takes significantly more data. Even true 3x resolution screens are
			// > wasteful as the human eye cannot see that level of detail without
			// > something like a magnifying glass.
			// https://blog.twitter.com/engineering/en_us/topics/infrastructure/2019/capping-image-fidelity-on-ultra-high-resolution-devices.html
			[width, width * 2 /*, width * 3*/].map(
				(w) => allSizes.find((p) => p >= w) || allSizes[allSizes.length - 1]
			)
		)
	];
	return { widths, kind: 'x' };
}