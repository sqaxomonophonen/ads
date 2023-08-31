#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function IMPL_TIME() {
	let args = [...arguments];
	const t0 = Date.now();
	let what;
	for (const arg of args) {
		if (what === undefined && typeof arg === "string") {
			what = arg;
		} else if (typeof arg === "function") {
			arg();
		} else {
			throw new Error("unhandled arg " + arg);
		}
	}
	const dt = (Date.now() - t0) * 1e-3;
	if (!what) what = "*unlabled*";
	let left = what + " ";
	while (left.length < 20) left += left.length & 1 ? "." : " ";
	console.log(left + " : " + dt.toFixed(3) + "s");
}

function NO_TIME() {
	for (const arg of [...arguments]) if (typeof arg === "function") arg();
}

const TIME = 1 ? IMPL_TIME : NO_TIME;

function match(ch, patterns) {
	for (const p of patterns) {
		if (p.length === 1) {
			if (ch === p[0]) return true;
		} else if (p.length === 2) {
			if (p[0] <= ch && ch <= p[1]) return true;
		} else {
			throw new Error("bad pattern: " + JSON.stringify(p));
		}
	}
	return false;
}

const one_of = (ch, chars) => chars.indexOf(ch) >= 0;

const WHITESPACE = " \t\n\r";

function open(file) {
	const source = fs.readFileSync(path.join(__dirname, file), {"encoding": "utf8"});
	let line = 1;
	let cursor_mark;
	let cursor = 0;
	let cursor_at_beginning_of_line = 0;

	function get() {
		const ch = source[cursor++];
		if (ch === "\n" && cursor > cursor_at_beginning_of_line) {
			line++;
			cursor_at_beginning_of_line = cursor;
		}
		return ch;
	}

	function eat_while_match(pattern) {
		while (match(get(), pattern)) {};
		cursor--;
		return source.slice(cursor_mark, cursor);
	}

	function skip_whitespace() {
		while (one_of(get(), WHITESPACE)) {};
		cursor--;
	}

	function skip_until_match_one_of(chars) {
		while (!one_of(get(), chars)) {};
	}

	const get_pos = () => "line " + line + ", column " + (cursor - cursor_at_beginning_of_line);
	function warn(msg) { console.warn("WARNING at " + get_pos() + ": " + msg); };
	function error(msg) { throw new Error("at " + get_pos() + ": " + msg); };
	const get_lines = () => source.split("\n")
	function mark() { cursor_mark = cursor; }

	return { get, get_lines, mark, eat_while_match, skip_whitespace, skip_until_match_one_of, error, warn };
}


function process_songlist_file(path) {
	const src = open(path);
	// TODO
}

function process_4st_file(path) {
	const WORD=101, NUMBER=102, OP1=203, CALL=204;
	const ID=201, INFIX=202, PREFIX=203, MATH1=211; // MATH2 would cover atan2... and...? imul? not worth it?

	const ISA = [
		// these ops are always in the vm (ID=STATIC)
		[   WORD    , "return"    ,  ID     ,  "STATIC"      ],
		[   WORD    , "if"        ,  ID     ,  "STATIC"      ],
		[   WORD    , "else"      ,  ID     ,  "STATIC"      ],
		[   WORD    , "endif"     ,  ID     ,  "STATIC"      ],
		// the remaining ops can be compiled out of the VM if unused:
		[   NUMBER  ,             ,  ID     ,  "PUSH_IMM"    ],
		[   WORD    , "times"     ,  ID     ,  "TIMES_LOOP"  ],
		[   WORD    , "loop"      ,  ID     ,  "TIMES_LOOP"  ],
		[   WORD    , "do"        ,  ID     ,  "DO_WHILE"    ],
		[   WORD    , "while"     ,  ID     ,  "DO_WHILE"    ],
		[   CALL    ,             ,  ID     ,  "CALL_IMM"    ],
		[   WORD    , "call"      ,  ID     ,  "CALL_POP"    ],
		[   WORD    , "dup"       ,  ID     ,  "DUP"         ],
		[   WORD    , "pop"       ,  ID     ,  "POP"         ],
		[   WORD    , "exchange"  ,  ID     ,  "EXCHANGE"    ],
		[   WORD    , "trirot"    ,  ID     ,  "TRIROT"      ],
		[   WORD    , "assert"    ,  ID     ,  "DEBUG"       ],
		[   WORD    , "dump"      ,  ID     ,  "DEBUG"       ],
		[   OP1     , "+"         ,  INFIX  ,  "+"           ],
		[   OP1     , "-"         ,  INFIX  ,  "-"           ],
		[   OP1     , "*"         ,  INFIX  ,  "*"           ],
		[   OP1     , "/"         ,  INFIX  ,  "/"           ],
		[   OP1     , "%"         ,  INFIX  ,  "%"           ],
		[   OP1     , "^"         ,  INFIX  ,  "**"          ],
		[   OP1     , "&"         ,  INFIX  ,  "&"           ],
		[   OP1     , "|"         ,  INFIX  ,  "|"           ],
		[   WORD    , "xor"       ,  INFIX  ,  "^"           ],
		[   WORD    , "lshift"    ,  INFIX  ,  "<<"          ],
		[   WORD    , "rshift"    ,  INFIX  ,  ">>"          ],
		[   OP1     , "="         ,  INFIX  ,  "=="          ],
		[   OP1     , "!"         ,  PREFIX ,  "!"           ],
		[   OP1     , "~"         ,  PREFIX ,  "~"           ],
		[   WORD    , "neg"       ,  PREFIX ,  "-"           ],
		//  OP1     , "@"  ...
		//  OP1     , "#"  ...
		//  OP1     , "$"  ...
		//  OP1     , "["  ...
		//  OP1     , "]"  ...
		//  OP1     , "{"  ...
		//  OP1     , "}"  ...
		//  OP1     , "<"  ...
		//  OP1     , ">"  ...
		//  OP1     , "?"  ...
		//  OP1     , "'"  ...
		//  OP1     , "\\"  ...
		//  OP1     , "\\"  ...
		[   WORD    , "gt"        ,  INFIX  ,  ">"           ],
		[   WORD    , "ge"        ,  INFIX  ,  ">="          ],
		[   WORD    , "lt"        ,  INFIX  ,  "<"           ],
		[   WORD    , "le"        ,  INFIX  ,  "<="          ],
		[   WORD    , "sqrt"      ,  MATH1  ,  "sqrt"        ],
		[   WORD    , "sin"       ,  MATH1  ,  "sin"         ],
		[   WORD    , "cos"       ,  MATH1  ,  "cos"         ],
		[   WORD    , "tan"       ,  MATH1  ,  "tan"         ],
		[   WORD    , "atan"      ,  MATH1  ,  "atan"        ],
		[   WORD    , "log"       ,  MATH1  ,  "log"         ],
		[   WORD    , "log2"      ,  MATH1  ,  "log2"        ],
		[   WORD    , "floor"     ,  MATH1  ,  "floor"       ],
		[   WORD    , "ceil"      ,  MATH1  ,  "ceil"        ],
		[   WORD    , "round"     ,  MATH1  ,  "round"       ],
		[   WORD    , "sign"      ,  MATH1  ,  "sign"        ],
		[   WORD    , "abs"       ,  MATH1  ,  "abs"         ],
	];

	let vm_prefix_ops = [];
	let vm_infix_ops = [];
	let vm_math1_ops = [];
	let lang_one_char_ops = "";
	let lang_builtin_word_to_vm_op_map = {};
	let lang_one_char_to_vm_op_map = {};
	let lang_number_vm_op;
	let lang_call_vm_op;

	for (let i = 0; i < ISA.length; i++) {
		const line = ISA[i];
		const [ ltype, lid, vtype, vid ] = line;
		const vm_op = [ i, vtype, vid ];
		switch (ltype) {
		case OP1:
			if (lid.length !== 1) throw new Error("SANITY CHECK FAILURE: 1ch op with length != 1?!");
			if (("a" <= lid && lid <= "z") || ("0" <= lid && lid <= "9")) throw new Error("FAILED SANITY CHECK: bad character " + lid);
			lang_one_char_ops += lid;
			lang_one_char_to_vm_op_map[lid] = vm_op;
			break;
		case WORD:
			lang_builtin_word_to_vm_op_map[lid] = vm_op;
			break;
		case NUMBER: lang_number_vm_op = vm_op; break;
		case CALL: lang_call_vm_op = vm_op; break;
		default: throw new Error("unhandled ltype/0 in  " + JSON.stringify(line));
		}

		switch (vtype) {
		case ID: break;
		case INFIX: vm_infix_ops.push(vid); break;
		case PREFIX: vm_prefix_ops.push(vid); break;
		case MATH1:  vm_math1_ops.push(vid); break;
		default: throw new Error("unhandled vtype/2 in  " + JSON.stringify(line));
		}
	}

	if (!lang_number_vm_op) throw new Error("SANITY CHECK FAIL: no 'number' VM op");
	if (!lang_call_vm_op) throw new Error("SANITY CHECK FAIL: no 'call' VM op");

	vm_prefix_ops.sort();
	vm_infix_ops.sort();
	vm_math1_ops.sort();

	const src = open(path);

	const new_word = () => ({ tokens: [] });

	let word = new_word();
	const super_word = word;
	delete(super_word.tokens); // throw error if code attempts to push tokens onto top-level word
	const word_stack = [word];

	let defword_state = 0;

	function push_token(typ, value, vm_op) {
		if (word_stack.length < 2 && typ !== "WORD") src.error("only word definitions (\":<word>\") are allowed at the top level");
		if (defword_state > 0) {
			if (typ !== "WORD") src.error("expected WORD");
			word.is_word_table_entry = defword_state === 2;
			word.name = value;
			const word_scope = word_stack[word_stack.length-2];
			if (word_scope.words === undefined) word_scope.words = [];
			word_scope.words.push(word);
			defword_state = 0;
		} else {
			word.tokens.push([typ, value, vm_op]);
		}
	}

	let comment_depth = 0;
	for (;;) {
		src.skip_whitespace();
		src.mark();
		const ch = src.get();
		if (comment_depth > 0) {
			if (ch === "(") {
				comment_depth++;
			} else if (ch == ")") {
				comment_depth--;
			}
			continue;
		}
		if (ch === undefined) {
			break;
		} else if (ch === "`") { // push word index
			src.mark();
			const word = src.eat_while_match(["az","09","_"]);
			push_token("PUSH_NUMBER_IMM_INDEX_OF_WORD", word, lang_number_vm_op);
		} else if /*word*/ (match(ch, ["az"])) {
			const word = src.eat_while_match(["az","09","_"]);
			const builtin_vm_op = lang_builtin_word_to_vm_op_map[word];
			if (builtin_vm_op) {
				push_token("BUILTIN_WORD", word, builtin_vm_op);
			} else {
				push_token("WORD", word, lang_call_vm_op);
			}
		} else if /*number */ (match(ch, ["09","-","."])) {
			// XXX number parser should be better:
			//  - if "-" doesn't come after "e", consider it to be
			//    the next token?
			const number = src.eat_while_match(["09","-",".","e",":"]);
			push_token("PUSH_NUMBER_IMM", number, lang_number_vm_op);
		} else if /*word definition*/ (ch === ":") {
			if (defword_state === 0) {
				word = new_word();
				word_stack.push(word);
			}
			defword_state++;
			if (!(1 <= defword_state && defword_state <= 2)) src.error("only : and :: allowed");
		} else if /*end of word definition (implicit return)*/ (ch === ";") {
			if (word_stack.length === 0) src.error("left top-level word");
			word_stack.pop();
			word = word_stack[word_stack.length-1];
		} else if (one_of(ch, lang_one_char_ops)) {
			push_token("OP1", ch, lang_one_char_to_vm_op_map[ch]);
		} else if /*comment*/ (ch === "(") {
			comment_depth++;
		} else {
			src.error("unexpected character");
		}
	}

	if (word_stack.length !== 1) src.error("word definition was not terminated");
	if (word !== super_word) throw new Error("bad state");

	const vm4stub_lines = open("vm4stub.js").get_lines();

	let _lk_counter = 1;
	function trace_program(match_fn) {
		const lift_set = {};

		let export_word_indices = [];
		let prg_words = [];
		function lift(word_stack) {
			if (word_stack.length < 2) throw new Error("ASSERTION ERROR: top-level cannot be lifted");
			const word = word_stack[word_stack.length-1];
			if (word._lk === undefined) word._lk = _lk_counter++;
			if (lift_set[word._lk]) return;
			lift_set[word._lk] = true;
			for (const token of word.tokens) {
				const typ = token[0];
				const is_w  = (typ === "WORD");
				const is_wi = (typ === "PUSH_NUMBER_IMM_INDEX_OF_WORD");
				if (!is_w && !is_wi) continue;
				const name = token[1];
				let found = false;
				for (let i0 = word_stack.length-1; i0 >= 0 && !found; i0--) {
					const w0 = word_stack[i0];
					const w0s = w0.words || [];
					for (let i1 = 0; i1 < w0s.length && !found; i1++) {
						const w1 = w0s[i1];
						if (w1.name === name) {
							found = true;
							if (is_wi && w1.is_word_table_entry) {
								// trace out word table
								let left, right;
								for (left  = i1; left >= 0          && w0s[left].is_word_table_entry; left--) {}
								left++;
								for (right = i1; right < w0s.length && w0s[right].is_word_table_entry; right++) {}
								right--
								for (let i2 = left; i2 <= right; i2++) {
									const w2 = w0s[i2];
									lift([...word_stack.slice(0, i0+1), w2]);
								}
							} else {
								lift([...word_stack.slice(0, i0+1), w1]);
							}
						}
					}
				}
				if (!found) throw new Error("word not found in scope: " + name);
			}
			if (word.do_export) export_word_indices.push(prg_words.length);
			prg_words.push([word.name, word.tokens]);
		}

		function rec(word_stack) {
			const word = word_stack[word_stack.length-1];
			if (word.name && match_fn(word_stack.length-2, word.name)) {
				word.do_export = true;
				lift(word_stack);
			}
			for (let subword of word.words || []) rec([...word_stack, subword]);
		}
		rec([super_word]);

		let required_vm_ids = {};
		let required_vm_other_ops = {};
		for (const w of prg_words) {
			const tokens = w[1];
			for (const t of tokens) {
				const vm_op_id = t[2][0];
				const line = ISA[vm_op_id];
				if (line[2] === ID) {
					required_vm_ids[line[3]] = true;
				} else {
					required_vm_other_ops[vm_op_id] = true;
				}
			}
		}

		let op_remap = {};
		let op_idx = 0;
		for (let i = 0; i < ISA.length; i++) {
			const line = ISA[i];
			const keep = (line[2] === ID && (line[3] === "STATIC" || required_vm_ids[line[3]])) || required_vm_other_ops[i];
			if (keep) op_remap[i] = op_idx++;
		}

		let vm_words = [];
		for (const w of prg_words) {
			let inst = [];
			for (const t of w[1]) {
				//console.log(t);
				const opi = op_remap[t[2][0]];
				if (opi === undefined) throw new Error("op with no mapping");
				//console.log(opi);
				switch (t[0]) {
				case "BUILTIN_WORD":
				case "OP1":
					inst.push([opi]);
					break;
				case "PUSH_NUMBER_IMM":
					inst.push([opi, parseInt(t[1], 10)]); // XXX
					break;
				case "WORD":
				case "PUSH_NUMBER_IMM_INDEX_OF_WORD": {
					let word_index = -1;
					for (let i1 = 0; i1 < prg_words.length; i1++) {
						if (prg_words[i1][0] === t[1]) {
							word_index = i1;
						}
					}
					if (word_index === -1) throw new Error("not found: " + t[1]);
					inst.push([opi, word_index]);
				} break;
				default:
					throw new Error("unhandled tok: " + JSON.stringify(t));
				}
			}
			vm_words.push(inst);
		}

		//required_vm_op_ids = Object.keys(required_vm_op_ids).map(x => parseInt(x,10)).sort((a,b)=>a-b);

		let vm, vm_src;
		{
			let piping = true;
			const expr0 = /\/\*ST4([:{}_])([^*]+)\*\//;
			const expr1 = /ST4_([A-Za-z0-9_]+)/;
			let pass_lines = [];
			for (const line of vm4stub_lines) {
				let mo0 = expr0.exec(line);
				const pass_line = () => pass_lines.push(line);
				function replace_id(id, vtype, join) {
					let xs = [];
					for (let i = 0; i < ISA.length; i++) {
						if (!(required_vm_other_ops[i] && ISA[i][2] === vtype)) continue;
						xs.push(ISA[i][3]);
					}
					if (xs.length === 0) return;
					xs.sort();
					pass_lines.push(line.replace(id, JSON.stringify(xs.join(join))));
				}

				if (mo0) {
					const typ = mo0[1];
					const id = mo0[2];
					let do_include;
					if (id === "STATIC") {
						do_include = true;
					} else {
						do_include = false;
						for (let i = 0; i < ISA.length && !do_include; i++) {
							const line = ISA[i];
							if (line[2] !== ID) continue;
							if (line[3] === id && required_vm_ids[id]) {
								do_include = true;
							}
						}
					}

					switch (typ) {
					case ":":
						if (do_include) pass_line();
						break;
					case "{":
						if (do_include) {
							pass_line();
						} else {
							piping = false;
						}
						break;
					case "}":
						if (piping) pass_line();
						piping = true;
						break;
					default: throw new Error("unexpected");
					}
				} else {
					let mo1 = expr1.exec(line);
					if (mo1) {
						const id = mo1[1];
						switch (mo1[1]) {
						case "INFIX":  replace_id(mo1[0], INFIX,  " "); break;
						case "PREFIX": replace_id(mo1[0], PREFIX, "");  break;
						case "MATH1":  replace_id(mo1[0], MATH1,  " "); break;
						default: throw new Error("unhandled id: " + id);
						}
					} else if (piping) {
						pass_line();
					}
				}
			}

			vm_src = pass_lines.join("\n");
			vm = eval(vm_src);
		}

		return {
			vm,
			vm_words,
			export_word_indices,
			vm_src,
		}
	}

	const test_prg = trace_program((depth,name) => name.startsWith("test_"));
	//console.log(test_prg);
	for (const i of test_prg.export_word_indices) {
		let s = test_prg.vm(test_prg.vm_words, i);
		//console.log([i,s]);
	}

	const main_prg = trace_program((depth,name) => depth === 0 && name.startsWith("main_"));
	//console.log(main_prg);
}

//process_songlist_file("main.songlist");
//console.log(__dirname)

TIME("4st processing"  , _=>process_4st_file("main.4st"));
