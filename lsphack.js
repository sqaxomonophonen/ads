#!/usr/bin/env node

const fs = require("fs");
const path = require('path');
const create_compiler = require("./compiler.js");

function LOG(msg) {
	// in neovim see :lua print(vim.lsp.get_log_path())
	console.error(msg);
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
		'keyword',
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
	const unsaved_changes = {};
	// ^^ reported by editor via LSP; this "filesystem view" sees these
	// unsaved changes, otherwise the actual file on disk.

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

	function unsaved_set(uri, contents) {
		unsaved_changes[uri_to_full_path(uri)] = contents;
	}

	function unsaved_forget(uri) {
		delete unsaved_changes[uri_to_full_path(uri)];
	}

	function read_full_path(fp) {
		assert_full_path(fp);
		let data;
		if (unsaved_changes[fp] !== undefined) {
			data = unsaved_changes[fp];
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
		unsaved_set,
		unsaved_forget,
	};
})();

function lsp_tokenize(uri) {
	const cc = create_compiler(null);
	const state = cc.tokenize_string(uri, filesys.read_uri(uri));

	let r = [];
	let prev_pos = [null, 0, 0, null];
	const n = state.tokens.length;
	for (let i = 0; i < n; i++) {
		const token = state.tokens[i];
		let typ = null, mod = [];
		switch (token[0]) {
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
			if (cc.keyword_set[token[1]]) {
				typ = "keyword";
			} else {
				typ = "variable";
				mod = [ "readonly" ];
			}
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

		case "TOKEN_ERROR":
			break;
		}

		if (typ === null) continue;
		const pos = state.positions[i];
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

const poll_state = (() => {
	let serial = 1;
	let packed_state = JSON.stringify([serial,null]);
	let listeners = [];
	let listener_serial = 1;

	function push(new_state) {
		// ima profesionl web devlopr
		if (packed_state === JSON.stringify([serial, new_state])) return;
		serial++;
		packed_state = JSON.stringify([serial, new_state]);
		for (const listener of listeners) listener[1](packed_state);
	}

	return {
		push,
		pack: () => packed_state,
		get_serial: () => serial,
		add_listener: (fn) => {
			const serial = listener_serial++;
			listeners.push([serial, fn]);
			return serial;
		},
		remove_listener: (serial) => {
			listeners = listeners.filter(x => x[0] !== serial);
		},
	};
})();

const vm = (() => {
	let n_passes = 1;
	let actual_passes = null;
	let max_iterations = 250e3;
	let cursor_position = null;
	let vm = null;
	let root;
	let entrypoint_filename = null;
	let entrypoint_word_path = null;

	function mk_compiler() {
		return create_compiler((filename) => filesys.read_full_path(path.join(root, filename)));
	}

	function publish(o) {
		poll_state.push({
			"n_passes": n_passes,
			"max_iterations": max_iterations,
			"entrypoint_filename": entrypoint_filename,
			"entrypoint_word_path": entrypoint_word_path,
			...o,
		});
	}

	function eq(p0, p1) { return JSON.stringify(p0) === JSON.stringify(p1); }

	function rerun() {
		actual_passes = null;
		if (entrypoint_word_path === null) return;
		const cc = mk_compiler();
		let prg;
		try {
			const cu = cc.compile(entrypoint_filename);
			prg = cu.trace_program_debug((p) => p === entrypoint_word_path);
		} catch (e) {
			if (e instanceof Array) {
				const loc = !e[0] ? "N/A" : e[0][0] + ":" + (1+e[0][1]) + ":" + e[0][2] + "-" +e[0][3] ;
				publish({error: "COMPILE ERROR at " + loc + " : " + e[1]});
			} else {
				publish({error: "INTERNAL ERROR: " + e});
			}
			return;
		}
		if (prg.export_word_indices.length !== 1) {
			const msg = "expected 1 exported word, got " + prg.export_word_indices.length;
			LOG(msg);
			publish({error: "INTERNAL ERROR: " + msg});
			return;
		}

		if (cursor_position != null) {
			const curpos = [
				path.basename(filesys.uri_to_full_path(cursor_position.uri)),
				cursor_position.line - 1,
				cursor_position.column,
			];

			prg.set_tmpbrk_at_cursor(curpos[0], curpos[1], curpos[2]);
		}

		let last_attempt_iteration_count, vm_state, iteration_budget_exceeded,
		    assertion_failed, runtime_error, passes_left ;
		const get_iteration_count = () => max_iterations - vm_state.get_iteration_counter();

		for (let attempt = 0; attempt < 2; attempt++) {
			vm_state = prg.new_state();
			vm_state.set_pc_to_export_word_index(0);
			vm_state.set_iteration_counter(
				attempt === 0 ? max_iterations            :
				attempt === 1 ? last_attempt_iteration_count :
				0);

			iteration_budget_exceeded = false;
			assertion_failed = false;
			runtime_error = null;
			passes_left = n_passes;
			while (passes_left > 0 && vm_state.can_run()) {
				if (vm_state.did_exit()) {
					break;
				}
				vm_state.run();
				if (vm_state.did_throw()) {
					runtime_error = vm_state.get_exception();
					break;
				}
				if (!vm_state.did_exit()) {
					if (vm_state.broke_at_tmpbrk()) {
						passes_left--;
						last_attempt_iteration_count = get_iteration_count() - 1;
						vm_state.step_over();
					} else if (vm_state.broke_at_brk()) {
						// in-code breakpoint
						LOG("BRK at " + JSON.stringify(vm_state.pc(-1)) +  " at " + vm_state.get_position_human());
					} else if (vm_state.broke_at_assertion()) {
						assertion_failed = true;
						break;
					} else if (vm_state.get_iteration_counter() === 0) {
						iteration_budget_exceeded = true;
						break;
					} else {
						throw new Error("unhandled break type " + JSON.stringify(vm_state.get_raw()));
					}
				}
			}

			if (passes_left === 0 || assertion_failed || runtime_error || (attempt === 0 && iteration_budget_exceeded)) {
				break;
			}
			iteration_budget_exceeded = false;
		}

		let error = null;
		if (runtime_error) {
			error = "runtime error " + runtime_error;
		} else if (assertion_failed) {
			error = "assertion failed";
		} else if (iteration_budget_exceeded) {
			error = "at max iterations (" + max_iterations + ")";
		}
		if (error !== null) error += " at " + vm_state.get_position_human();
		actual_passes = Math.max(1, n_passes - passes_left);
		publish({
			actual_passes,
			n_iterations: get_iteration_count(),
			stack: vm_state.get_tagged_stack(),
			rstack: vm_state.get_rstack(),
			error,
		});
	}

	function set_position(pos) {
		if (eq(cursor_position, pos)) return;
		cursor_position = pos;
		rerun();
	}

	function set_entrypoint_at_position(pos) {
		const fp = filesys.uri_to_full_path(pos.uri);
		root = path.dirname(fp);
		entrypoint_word_path = null;
		const cc = mk_compiler();
		const filename = path.basename(fp);
		entrypoint_filename = filename;
		const state = cc.tokenize_file(filename);
		const word_path = cc.find_word_path(state, filename, pos.line-1, pos.column);
		if (word_path) {
			entrypoint_word_path = word_path;
			rerun();
		}
	}

	function add_to_n_passes(d) {
		const old_n_passes = n_passes;
		n_passes = Math.max(1, n_passes + d);
		if (d < 0 && actual_passes !== null) {
			n_passes = Math.min(n_passes, actual_passes);
		}
		if (n_passes !== old_n_passes) rerun();
	}

	function max_iterations_scale(scalar) {
		max_iterations *= scalar;
		rerun();
	}

	return {
		rerun,
		add_to_n_passes,
		max_iterations_scale,
		set_entrypoint_at_position,
		set_position,
	};
})();

let goto_hack_arguments;

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
						"max_iterations_scale",
						"prepare_goto_hack",
					],
				},

				implementationProvider: true,
				typeDefinitionProvider: true,

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
		} else if (p.command === "max_iterations_scale") {
			vm.max_iterations_scale(args.scalar);
		} else if (p.command === "prepare_goto_hack") {
			goto_hack_arguments = p.arguments;
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
		filesys.unsaved_set(uri, text);
	} else if (m === "textDocument/didChange") {
		const text = p.contentChanges[0].text;
		const version = p.textDocument.version;
		const uri = p.textDocument.uri;
		//LOG("didchange"+JSON.stringify([version,uri,text]));
		invoke("workspace/semanticTokens/refresh");
		filesys.unsaved_set(uri, text);
		vm.rerun();
	} else if (m === "textDocument/didClose") {
		const uri = p.textDocument.uri;
		filesys.unsaved_forget(uri);
	} else if (m === "textDocument/didSave") {
		const uri = p.textDocument.uri;
		filesys.unsaved_forget(uri);
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
	} else if (m === "textDocument/implementation") {
	} else if (m === "textDocument/typeDefinition") {
		const arg = goto_hack_arguments;
		if (!arg) {
			send_result(null);
		} else {
			switch (arg.what) {
			case "step":
			case "callstack":
			case "brk": {
				const d = goto_hack_arguments.direction;
				send_result({
					uri: p.textDocument.uri,
					range: {
						start: {  line:  p.position.line+d,  character: p.position.character  },
						end:   {  line:  p.position.line+d,  character: p.position.character  },
					}
				});
			} break;
			default:
				console.error("what what? " + arg.what);
				send_result(null);

			}
		}
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
	if (poll_state.get_serial() > seen_serial) {
		callback(poll_state.pack());
	} else {
		let listener_handle, timeout_handle;
		function cancel() {
			poll_state.remove_listener(listener_handle);
			clearTimeout(timeout_handle);
		}

		listener_handle = poll_state.add_listener((pack) => {
			cancel();
			callback(pack);
		});

		timeout_handle = setTimeout(() => {
			cancel();
			callback(null);
		}, 4444);
	}
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

	const STATICS = { "hack.html":1, "hack.js":1 };

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
				serve_static("hack.html");
			} else {
				serve405("GET");
			}
		} else {
			const p0 = ps.shift();
			if (ps.length > 0) return serve404(); // we only serve one-element paths around here
			if (req.method === "GET" && STATICS[p0]) {
				serve_static(p0);
			} else {
				const sig = req.method + " /" + p0;
				if (sig === "POST /poll") {
					read_request_body().then(body => {
						body = JSON.parse(body);
						long_poll(body.seen_serial, (o) => {
							serve_raw_json(o === null ? "null" : o);
						});
					});
				} else {
					serve404();
				}
			}
		}
	} catch (e) {
		serve500();
		console.error(e);
	}
}).listen(PORT, () => {
	LOG("view http://localhost:" + PORT);
});
