#!/usr/bin/env node

const PORT = 6969;

const fs = require('fs');
const http = require('http');
const url = require('url');
const path = require('path');
const { spawn } = require('node:child_process');

const pipe = (stdin, argv) => new Promise((resolve,reject) => {
	const p = spawn(argv[0], argv.slice(1));
	const chunks = [];
	p.stdout.on("data", (data) => {
		chunks.push(data);
	});
	p.stderr.on("data", (data) => {
		console.error(argv, "ERROR", data.toString("utf-8"));
	});
	p.on("close", (code) => {
		if (code === 0) {
			resolve(Buffer.concat(chunks).toString());
		} else {
			reject("ERROR in " + argv.join(" "));
		}
	});
	p.stdin.write(stdin);
	p.stdin.end();
});

http.createServer((req, res) => {
	const uo = url.parse(req.url);
	const ps = uo.pathname.split("/").filter(x => x.length);

	const serve = (status, content_type, body, extra_headers) => {
		console.log(req.method + " " + uo.pathname + " -> " + status);
		res.writeHead(status, {"Content-Type": content_type, ...extra_headers});
		res.write(body);
		res.end();
	};

	const read_file = (filename) => fs.promises.readFile(path.join(__dirname, filename), {"encoding": "utf8"})

	const serve200 = (content_type, body) => serve(200, content_type, body);
	const serve404 = () => serve(404, "text/plain", "Not Found");
	const serve405 = (allow) => serve(405, "text/plain", "Method Not Allowed", {"Allow": allow});
	const serve500 = () => serve(500, "text/plain", "Internal Server Error");
	const serve_utf8_file = (content_type, filename) => read_file(filename).then(c => serve200(content_type, c));

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
			serve_utf8_file(mime, path.join("static_hack", name));
		} else if (typeof s === "function") {
			s(name);
		} else {
			throw new Error("unhandled static value: " + s);
		}
	};

	const serve_raw_json = (json) => serve200("application/json; charset=utf-8", json);
	const serve_json = (o) => serve_raw_json(JSON.stringify(o));

	const read_request_body = () => new Promise((resolve,reject) => {
		let chunks = [];
		req.on("data", (chunk) => {
			chunks.push(chunk);
		});
		req.on("end", () => {
			resolve(Buffer.concat(chunks).toString());
		});
	});

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
						let ps = [];
						Promise.all(PRG.map(p=>read_file(p))).then(all => {
							let o = { prg: [] };
							for (let i = 0; i < all.length; i++) {
								o.prg.push([PRG[i], all[i]]);
							}
							serve_json(o);
						});
					} break;
					case "dot": serve405("POST"); break;
					default: serve404(); break;
					}
				} else if (req.method === "POST") {
					const p1 = ps.shift();
					switch (p1) {
					case "prg": serve405("GET"); break;
					case "dot": read_request_body().then(body => {
						pipe(body, ["dot", "-Tjson"]).then(r => {
							serve_raw_json(r);
						}).catch(c => {
							console.error(c);
							serve500();
						});
					}); break;
					default: serve404(); break;
					}
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
