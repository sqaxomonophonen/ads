#!/usr/bin/env node

const fs = require("fs");

function LOG(msg) {
	// in neovim see :lua print(vim.lsp.get_log_path())
	process.stderr.write(msg + "\n");
}

let poll_state = {
	serial: 1,
	cursor: null,
};

function process_client_message(msg) {
	const o = JSON.parse(msg);
	const m = o.method;
	const p = o.params;

	function respond(result) {
		let json = JSON.stringify({
			"jsonrpc": "2.0",
			"id": o.id,
			result,
		});
		process.stdout.write("Content-Length: " + json.length + "\r\n\r\n" + json);
	}

	if (m === "initialize") {
		LOG("INIT:"+JSON.stringify(msg));
		respond({
			capabilities: {
				positionEncoding: "utf-8",
				// ask client to send entire doc (alternative
				// is "incremental")
				textDocumentSync: 1,
				//hoverProvider: true, // alternative?
				executeCommandProvider: {
					commands: [
						"cursor",
						// ...?
					],
				},
			},
		});
	/*
	} else if (m === "textDocument/hover") {
		LOG("HOV:"+JSON.stringify(p));
		// HOV:{"position":{"character":0,"line":3},"textDocument":{"uri":"file://"}}
		respond({
			contents: ""
		});
	*/
	} else if (m === "workspace/executeCommand") {
		if (p.command === "cursor") {
			if (JSON.stringify(poll_state.cursor) !== JSON.stringify(p.arguments.c)) {
				LOG("cursor:"+JSON.stringify(p.arguments.c));
				poll_state.cursor = p.arguments.c;
				poll_state.serial++;
			}

		} else {
			LOG("unhandled command:"+JSON.stringify(msg));
		}
		respond(null);
	} else if (m === "shutdown") {
		LOG("shutdown!");
		process.exit(0);
	} else {
		LOG("UNHANDLED:"+JSON.stringify(msg));
	}
}

let state = 0;
let buffer = "";
let content_length = null;
process.stdin.on('data', (data) => {
	data = data.toString("utf-8");
	buffer += data;
	while (buffer.length > 0) {
		if (state === 0) {
			let crlf = buffer.indexOf("\r\n");
			if (crlf !== -1) {
				const header = buffer.slice(0, crlf);
				buffer = buffer.slice(crlf+2);
				if (header.length === 0 && content_length > 0) {
					state = 1;
				} else if (header.length > 0) {
					const hs = header.split(":").map(x=>x.trim())
					if (hs[0].toLowerCase() === "content-length") {
						content_length = parseInt(hs[1], 10);
					}
				}
			}
		} else if (state === 1 && buffer.length >= content_length) {
			process_client_message(buffer.slice(0, content_length));
			buffer = buffer.slice(content_length);
			state = 0;
			content_length = null;
		}
	}
});


const PORT = 6969;

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

function long_poll(seen_serial, callback) {
	const t0 = Date.now();
	function pollfn() {
		if (poll_state.serial > seen_serial) {
			callback(poll_state);
		} else {
			const dt = Date.now() - t0;
			if (dt < 30000) {
				setTimeout(pollfn, 50)
			} else {
				callback(null);
			}
		}
	}
	pollfn()
}

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
		"lsphack.html":   1,
	};

	const serve_static = (name) => {
		const s = STATICS[name];
		if (!s) return serve404();
		if (s === 1) {
			const mime = MIME[path.extname(name).slice(1)];
			serve_utf8_file(mime, name);
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
				serve_static("lsphack.html");
			} else {
				serve405("GET");
			}
		} else {
			const p0 = ps.shift();
			if (ps.length > 0) return serve404(); // we only serve one-element paths around here
			const sig = req.method + " /" + p0;
			if (sig === "POST /poll") {
				read_request_body().then(body => {
					body = JSON.parse(body);
					long_poll(body.seen_serial, (o) => {
						serve_json(o);
					});
				});
			} else {
				serve404();
			}
		}
	} catch (e) {
		serve500();
		console.error(e);
	}
}).listen(PORT, () => {
	LOG("view http://localhost:" + PORT);
});
