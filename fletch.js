#!/usr/bin/env node

const puppeteer = require('puppeteer');
const request = require('request');
const fs = require('fs');
const zlib = require('zlib');
const tar = require('tar-fs');
const JSONStream = require('JSONStream');
const Promise = require("bluebird");

(async () => {

    async function getURL(browser, proj) {
	const page = await browser.newPage();
	await page.goto(`https://glitch.com/edit/#!/${proj}`, {waitUntil: 'networkidle2'});
	await page.evaluate(() => window.application.remixProject());
	const url = await page.evaluate(() => window.application.projectDownloadUrl());
	page.close();
	return url;
    }

    function download(url, dir) {
	return new Promise((success, fail) => {
	    request(url)
		.on('error', fail)
		.pipe(zlib.createGunzip())
		.on('error', fail)
		.pipe(tar.extract(dir))
		.on('error', fail)
		.on('finish', success);
	});
    }

    async function fletch(browser, projects, concurrency=1) {
	return Promise.map(projects, async (p) => {
	    const dirlog = `\x1b[1m${p.dir}\x1b[0m`;
	    const [rd, gn, yw, rs] = ['\x1b[31m', '\x1b[32m', '\x1b[33m', '\x1b[0m'];
	    if (fs.existsSync(p.dir)) {
		console.log(`${rd}×${rs} ${dirlog}: Already exists, skipping.`);
		return { success: false, ...p };
	    } else {
		try {
		    console.log(`${yw}+${rs} ${dirlog}: Fetching url. (${p.name})`);
		    const url = await getURL(browser, p.name);
		    console.log(`${yw}+${rs} ${dirlog}: Downloading. (${url})`);
		    const dir = await download(url, p.dir);
		    console.log(`${gn}✓${rs} ${dirlog}: Downloaded!`);
		    return { success: true, ...p };
		} catch (e) {
		    console.log(`${rd}×${rs} ${dirlog}: Download failed (${e})`);
		    return { success: false, ...p };
		}
	    }
	}, {
	    concurrency,
	});
    }

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    if (process.argv.length > 2) {
	const data = [];
	for (let i = 2; i < process.argv.length; i++) {
	    [dir, name] = process.argv[i].split(':');
	    data.push({ dir , name });
	}
	console.log(await fletch(browser, data));
    } else {
	await new Promise(async (success, fail) => {
	    process.stdin.pipe(JSONStream.parse()).on('data', async (data) => {
		const ret = await fletch(browser, data);
		console.log(ret);
		success(ret);
	    });
	});
    }
    await browser.close();
})();
