#!/usr/bin/env node

const PORT = 6969;

const fs = require('fs');
const http = require('http');
const url = require('url');
const path = require('path');

http.createServer((req, res) => {
	const uo = url.parse(req.url);
	const ps = uo.pathname.split("/").filter(x => x.length);

	const serve = (status, content_type, body, extra_headers) => {
		console.log(req.method + " " + uo.pathname + " -> " + status);
		res.writeHead(status, {"Content-Type": content_type, ...extra_headers});
		res.write(body);
		res.end();
	};

	const read_file = (filename) => fs.readFileSync(path.join(__dirname, filename), {"encoding": "utf8"})

	const serve200 = (content_type, body) => serve(200, content_type, body);
	const serve404 = () => serve(404, "text/plain", "Not Found");
	const serve405 = (allow) => serve(405, "text/plain", "Method Not Allowed", {"Allow": allow});
	const serve500 = () => serve(500, "text/plain", "Internal Server Error");
	const serve_utf8_file = (content_type, filename) => serve200(content_type, read_file(filename));

	const MIME = {
		"html": "text/html; charset=utf-8",
		"js":   "text/javascript; charset=utf-8",
	};

	const STATICS = {
		"index.html": 1,
		"index.js":   1,
	};

	const PRG = [
		"hack.4st",
		"lib.4st",
		"main.4st",
		"selftest.4st",
	];

	const serve_static = (name) => {
		const s = STATICS[name];
		if (!s) return serve404();
		if (s === 1) {
			const mime = MIME[path.extname(name).slice(1)];
			serve_utf8_file(mime, "static_hack/" + name);

		} else if (typeof s === "function") {
			s(name);
		} else {
			throw new Error("unhandled static value: " + s);
		}
	};

	const serve_json = (o) => serve200("appication/json; charset=utf-8", JSON.stringify(o));

	try {
		if (ps.length === 0) {
			if (req.method === "GET") {
				serve_static("index.html");
			} else {
				serve405("GET");
			}
		} else {
			const p0 = ps.shift();
			switch (p0) {
			case "static":
				if (req.method === "GET") {
					const p1 = ps.shift();
					if (ps.length === 0) {
						serve_static(p1);
					} else {
						serve404();
					}
				} else {
					serve405("GET");
				}
				break;
			case "api":
				if (req.method === "GET") {
					const p1 = ps.shift();
					switch (p1) {
					case "prg": {
						let o = { prg: [] };
						for (let prg of PRG) {
							o.prg.push([prg, read_file(prg)]);
						}
						serve_json(o);
					} break;
					default: serve404(); break;
					}
				} else if (req.method === "POST") {
					throw new Error("TODO");
				}
				break;
			default: serve404(); break;
			}
		}
	} catch (e) {
		serve500();
		console.error(e);
	}
}).listen(PORT, () => {
	console.log("Point browser at:\nhttp://localhost:" + PORT);
});
