#!/usr/bin/env node

const fs = require("fs");
const path = require('path');
const create_compiler = require("./compiler.js");

function LOG(msg) {
	// in neovim see :lua print(vim.lsp.get_log_path())
	process.stderr.write(msg + "\n");
}

const ssmap = (ss) => {
	let map = {};
	for (let i = 0; i < ss.length; i++) {
		map[ss[i]] = i;
	}
	return key => {
		if (map[key] === undefined) throw new Error("invalid key: " + key);
		return map[key];
	};
};

const toktyp = (() => {
	// LSP SemanticTokenTypes (uncomment those we support)
	const strings = [
		//'namespace',
		//'type',
		//'class',
		//'enum',
		//'interface',
		//'struct',
		//'typeParameter',
		//'parameter',
		'variable',
		'property',
		//'enumMember',
		//'event',
		'function',
		'method',
		'macro',
		//'keyword',
		//'modifier',
		'comment',
		//'string',
		'number',
		//'regexp',
		'operator',
		//'decorator'
	];
	const map = ssmap(strings);
	return { strings, lookup: k => map(k) };
})();

const tokmod = (() => {
	// LSP SemanticTokenModifiers (uncomment those we support)
	const strings = [
		//'declaration',
		//'definition',
		'readonly',
		'static',
		//'deprecated',
		//'abstract',
		//'async',
		//'modification',
		//'documentation',
		//'defaultLibrary',
	];
	const map = ssmap(strings);
	return {
		strings,
		lookup_all: (ks) => {
			let b = 0;
			for (const k of ks) {
				b |= 1 << map(k);
			}
			return b;
		},
	}
})();

const filesys = (() => {
	const shadow_map = {};

	function assert_full_path(p) {
		if (!path.isAbsolute(p)) throw new Error("expected full path, got: " + p);
	}

	function uri_to_full_path(uri) {
		const FILE = "file://";
		if (uri.startsWith(FILE)) {
			const fp = uri.slice(FILE.length);
			assert_full_path(fp);
			return fp;
		} else {
			throw new Error("cannot uri_to_full_path() on " + uri);
		}
	}

	function shadow_set(uri, contents) {
		shadow_map[uri_to_full_path(uri)] = contents;
	}

	function shadow_forget(uri) {
		delete shadow_map[uri_to_full_path(uri)];
	}

	function read_full_path(fp) {
		assert_full_path(fp);
		let data;
		if (shadow_map[fp] !== undefined) {
			data = shadow_map[fp];
		} else {
			data = fs.readFileSync(fp, {"encoding": "utf8"});
		}
		if (typeof data !== "string") throw new Error("expected string, got " + (typeof data));
		return data;
	}

	function read_uri(uri) {
		return read_full_path(uri_to_full_path(uri));
	}

	return {
		uri_to_full_path,
		read_full_path,
		read_uri,
		shadow_set,
		shadow_forget,
	};
})();

function lsp_tokenize(uri) {
	const tokens = create_compiler(null).tokenize_string(uri, filesys.read_uri(uri));

	let r = [];
	let prev_pos = [null, 0, 0, null];
	for (const t of tokens) {
		let typ = null, mod = [];
		switch (t[1]) {
		case "BEGIN_WORD":
		case "END_WORD":
			typ = "function";
			break;

		case "BEGIN_INLINE_WORD":
			typ = "function";
			mod = [ "static" ];
			break;

		case "BEGIN_TABLE_WORD":
			typ = "method";
			break;

		case "NUMBER":
			typ = "number";
			break;

		case "BUILTIN_WORD":
			typ = "variable";
			mod = [ "readonly" ];
			break;

		case "USER_WORD":
			typ = "variable";
			break;

		case "WORD_INDEX":
			typ = "property";
			break;

		case "COMMENT":
			typ = "comment";
			break;

		case "OP":
			typ = "operator";
			break;

		case "DIRECTIVE":
			typ = "macro";
			break;
		}

		if (typ === null) continue;
		const pos = t[0];
		r.push(pos[1] - prev_pos[1]);
		r.push((prev_pos[1] === pos[1] ? pos[2] - prev_pos[2] : pos[2]));
		r.push(pos[3] - pos[2]);
		r.push(toktyp.lookup(typ));
		r.push(tokmod.lookup_all(mod));
		prev_pos = pos;
	}

	//LOG(JSON.stringify(r));
	return r;
}

function deepeq(a,b) {
	const ta = typeof a;
	const tb = typeof b;
	if (ta !== tb) return false;
	if ((a === null) !== (b === null)) return false;
	if (a === null) return true;
	if (ta !== "object") return a === b;
	if (a instanceof Array && b instanceof Array) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!deepeq(a[i],b[i])) return false;
		}
		return true;
	} else {
		const ka = Object.keys(a);
		const kb = Object.keys(b);
		if (ka.length !== kb.length) return false;
		ka.sort();
		kb.sort();
		for (let i = 0; i < ka.length; i++) {
			if (ka[i] !== kb[i]) return false;
			const k = ka[i];
			if (!deepeq(a[k], b[k])) return false;
		}
		return true;
	}
}

const vm = (() => {
	let n_passes = 0;
	//let total_passes; // XXX?
	let max_iterations = 250e3;
	let position = null;
	let vm = null;
	let serial = 1;
	let root;
	let entrypoint_filename;
	let entrypoint_word = null;

	function mk_compiler() {
		return create_compiler((filename) => filesys.read_full_path(path.join(root, filename)));
	}

	function rerun() {
		if (entrypoint_word === null) return;
		try {
			const cu = mk_compiler().compile(entrypoint_filename);
			const prg = cu.trace_program((depth,name) => name === entrypoint_word);
			if (prg.export_word_indices.length !== 1) {
				LOG("expected 1 exported word, got " + prg.export_word_indices.length);
				return;
			}
			let vm_state = [
				prg.export_word_indices[0], 0,
				[], [], [],
				max_iterations,
				new WeakSet(),
			];
			for (let i = 0; i <= n_passes; i++) {
				vm_state = prg.vm(prg.vm_words, vm_state);
				if (vm_state[5] === 0) break;
			}
			LOG("stack:"+JSON.stringify(vm_state[2]));
		} catch(e) {
			LOG("COMPILE ERROR: " + e);
		}
	}

	function set_position(pos) {
		if (deepeq(position, pos)) return;
		position = pos;
		rerun();
	}

	function set_entrypoint_at_position(pos) {
		//LOG("LOCATE!" + JSON.stringify(pos));
		const fp = filesys.uri_to_full_path(pos.uri);
		root = path.dirname(fp);
		entrypoint_word = null;
		const cc = mk_compiler();
		const filename = path.basename(fp);
		entrypoint_filename = filename;
		const tokens = cc.tokenize_file(filename);
		//LOG("TOK!" + JSON.stringify(tokens));
		for (const tok of tokens) {
			const tokpos = tok[0];
			if (tokpos[0] !== filename) continue;
			if (tokpos[1] !== (pos.line-1)) continue;
			if (!(tokpos[2] <= pos.column && pos.column <= tokpos[3])) continue;
			if (tok[1] !== "BEGIN_WORD") continue;
			entrypoint_word = tok[2];
			break;
		}
		rerun();
	}

	function add_to_n_passes(d) {
		n_passes += d;
		rerun();
	}

	return {
		rerun,
		add_to_n_passes,
		set_entrypoint_at_position,
		set_position,
		get_serial: ()=>serial,
	};
})();

let files = {};


function process_client_message(msg) {
	//LOG("RECV:"+msg);
	const o = JSON.parse(msg);
	const m = o.method;
	const p = o.params;

	function send(id, more) {
		let json = JSON.stringify({
			"jsonrpc": "2.0",
			"id": id,
			...more,
		});
		//LOG("SEND:"+json);
		process.stdout.write("Content-Length: " + json.length + "\r\n\r\n" + json);
	}

	const send_result = result => send(o.id, {result});

	let next_invoke_id = 0;
	function invoke(method, params) {
		if (params === undefined) params = null;
		send(next_invoke_id++, {method,params});
	}

	if (m === undefined) {
		// ignore invoke response?
	} else if (m === "initialize") {
		//LOG("INIT:"+JSON.stringify(msg));
		send_result({
			serverInfo: {
			    "name": "lsphack",
			    "version": "the final version",
			},

			capabilities: {
				positionEncoding: "utf-8",
				textDocumentSync: 1,

				executeCommandProvider: {
					commands: [
						"position",
						"entrypoint",
						"passes",
					],
				},

				semanticTokensProvider: {
					range: false,
					full: { delta: false },
					legend: {
						tokenTypes:     toktyp.strings,
						tokenModifiers: tokmod.strings,
					},
				},
			},
		});
		LOG("lsphack.js started!");
	} else if (m === "initialized") {
		// ...
	/*
	} else if (m === "textDocument/hover") {
		LOG("HOV:"+JSON.stringify(p));
		// HOV:{"position":{"character":0,"line":3},"textDocument":{"uri":"file://"}}
		send_result({
			contents: ""
		});
	*/
	} else if (m === "workspace/executeCommand") {
		const args = p.arguments;
		if (p.command === "position") {
			vm.set_position(args);
		} else if (p.command === "entrypoint") {
			vm.set_entrypoint_at_position(args);
		} else if (p.command === "passes") {
			vm.add_to_n_passes(args.delta);
		} else {
			LOG("unhandled command:"+msg);
		}
		send_result(null);
	} else if (m === "textDocument/didOpen") {
		const text = p.textDocument.text;
		const version = p.textDocument.version;
		const uri = p.textDocument.uri;
		//LOG(JSON.stringify(["OPEN",version,uri,text]));
		invoke("workspace/semanticTokens/refresh");
		filesys.shadow_set(uri, text);
	} else if (m === "textDocument/didChange") {
		const text = p.contentChanges[0].text;
		const version = p.textDocument.version;
		const uri = p.textDocument.uri;
		//LOG("didchange"+JSON.stringify([version,uri,text]));
		invoke("workspace/semanticTokens/refresh");
		filesys.shadow_set(uri, text);
		vm.rerun();
	} else if (m === "textDocument/didClose") {
		const uri = p.textDocument.uri;
		filesys.shadow_forget(uri);
	} else if (m === "textDocument/didSave") {
		filesys.shadow_forget(uri);
		vm.rerun();
	} else if (m === "textDocument/semanticTokens/full") {
		//LOG("TOK:"+JSON.stringify(p));
		const uri = p.textDocument.uri;
		send_result({
			data: lsp_tokenize(uri),
		});
	} else if (m === "shutdown") {
		LOG("shutdown!");
		process.exit(0);
	} else if (m === "$/cancelRequest") {
		// blah blah
		send(p.id, {error: {"code":-32800,"message":"Request cancelled"}});
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
		if (vm.get_serial() > seen_serial) {
			callback(poll_state);
		} else {
			const dt = Date.now() - t0;
			if (dt < 4444) {
				setTimeout(pollfn, 20)
			} else {
				callback(null);
			}
		}
	}
	pollfn();
}

http.createServer((req, res) => {
	const uo = url.parse(req.url);
	const ps = uo.pathname.split("/").filter(x => x.length);

	function serve(status_code, content_type, body, extra_headers) {
		console.log(req.method + " " + uo.pathname + " -> " + status_code);
		res.writeHead(status_code, {"Content-Type": content_type, ...extra_headers});
		res.write(body);
		res.end();
	}

	const read_file = (filename) => fs.promises.readFile(path.join(__dirname, filename), {"encoding": "utf8"});

	const serve200 = (content_type, body) => serve(200, content_type, body);
	const serve404 =      () => serve(404, "text/plain", "Not Found");
	const serve405 = (allow) => serve(405, "text/plain", "Method Not Allowed", {"Allow": allow});
	const serve500 =      () => serve(500, "text/plain", "Internal Server Error");
	const serve_utf8_file = (content_type, filename) => read_file(filename).then(c => serve200(content_type, c));

	const MIME = {
		"html": "text/html; charset=utf-8",
		  "js": "text/javascript; charset=utf-8",
	};

	const STATICS = { "lsphack.html": 1 };

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
