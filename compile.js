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

// could be replaced by object lookup in browser?
const RESOLVE_FILE = (filename) => fs.readFileSync(path.join(__dirname, filename), {"encoding": "utf8"});

function open(file) {
	let file_stack = [];
	let cursor_mark, mark_pos;
	let top;

	function set_top() { top = file_stack[file_stack.length-1]; };

	function push_file(filename) {
		file_stack.push({
			filename,
			line: 1,
			cursor: 0,
			cursor_at_beginning_of_line: 0,
			src: RESOLVE_FILE(filename),
		});
		set_top();
	}

	function pop_file() {
		file_stack.pop();
		set_top();
		return file_stack.length === 0;
	}

	push_file(file);

	function get() {
		const ch = top.src[top.cursor++];
		if (ch === "\n" && top.cursor > top.cursor_at_beginning_of_line) {
			top.line++;
			top.cursor_at_beginning_of_line = top.cursor;
		}
		return ch;
	}

	const get_pos_array = () => [top.filename, top.line, (top.cursor - top.cursor_at_beginning_of_line + 1)];
	const get_pos = () => {
		const ps = get_pos_array();
		return "file " + ps[0] + ", line " + ps[1] + ", column " + ps[2];
	};
	function warn(msg) { console.warn("WARNING at " + get_pos() + ": " + msg); };
	function error(msg) { throw new Error("at " + get_pos() + ": " + msg); };
	const get_lines = () => top.src.split("\n")
	function mark() {
		cursor_mark = top.cursor;
		mark_pos = get_pos_array();
	}
	const get_mark_pos = _ => mark_pos;

	function eat_while_match(pattern) {
		for (;;) {
			const ch = get();
			if (ch === undefined) error("ate past EOF");
			if (!match(ch, pattern)) break;
		}
		top.cursor--;
		return top.src.slice(cursor_mark, top.cursor);
	}

	function skip_whitespace() {
		while (one_of(get(), WHITESPACE)) {};
		top.cursor--;
	}

	function skip_until_match_one_of(chars) {
		while (!one_of(get(), chars)) {};
	}

	return { get_mark_pos, push_file, pop_file, get, get_lines, mark, eat_while_match, skip_whitespace, skip_until_match_one_of, error, warn };
}

function process_4st_file(path) {
	const WORD=101, NUMBER=102, OP1=203, CALL=204;
	const ID=201, INFIX=202, PREFIX=203, MATH1=211, USRWORD=299; // MATH2 would cover atan2... and...? imul? not worth it?
	const ISA = [
		// NOTE: ISA order must match vm4stub.js order

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
		[   WORD    , "pick"      ,  ID     ,  "PICK"        ],
		[   WORD    , "drop"      ,  ID     ,  "DROP"        ],
		[   WORD    , "nrot"      ,  ID     ,  "NROT"        ], // called "roll" in forth
		[   WORD    , "ntro"      ,  ID     ,  "NTRO"        ],
		[   OP1     , "+"         ,  INFIX  ,  "+"           ],
		[   OP1     , "-"         ,  INFIX  ,  "-"           ],
		[   OP1     , "*"         ,  INFIX  ,  "*"           ],
		[   OP1     , "/"         ,  INFIX  ,  "/"           ],
		[   OP1     , "%"         ,  INFIX  ,  "%"           ],
		[   OP1     , "^"         ,  INFIX  ,  "**"          ],
		[   OP1     , "&"         ,  INFIX  ,  "&"           ],
		[   OP1     , "|"         ,  INFIX  ,  "|"           ],
		[   WORD    , "xor"       ,  INFIX  ,  "^"           ],
		[   WORD    , "and"       ,  INFIX  ,  "&&"          ],
		[   WORD    , "or"        ,  INFIX  ,  "||"          ],
		[   WORD    , "lshift"    ,  INFIX  ,  "<<"          ],
		[   WORD    , "rshift"    ,  INFIX  ,  ">>"          ],
		[   OP1     , "="         ,  INFIX  ,  "=="          ],
		[   WORD    , "ne"        ,  INFIX  ,  "!="          ],
		[   WORD    , "gt"        ,  INFIX  ,  ">"           ],
		[   WORD    , "ge"        ,  INFIX  ,  ">="          ],
		[   WORD    , "lt"        ,  INFIX  ,  "<"           ],
		[   WORD    , "le"        ,  INFIX  ,  "<="          ],
		[   WORD    , "not"       ,  PREFIX ,  "!"           ],
		[   WORD    , "neg"       ,  PREFIX ,  "-"           ],

		// math
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

		[   WORD    , "getglobal" ,  ID     ,  "getglobal"   ], //        index -- globals[index]
		[   WORD    , "setglobal" ,  ID     ,  "setglobal"   ], //  index value --                 ( sets globals[index]=value )

		[   WORD    , "isnumber"  ,  ID     ,  "isnumber"    ], // x -- x isnumber(x) 1 if number, otherwise 0
		[   WORD    , "isarr"     ,  ID     ,  "isarr"       ], // x -- x isarr(x)    1 if array,  otherwise 0

		// arrays
		[   WORD    , "arrnew"    ,  ID     ,  "arrnew"      ], //              -- []
		[   WORD    , "arrlen"    ,  ID     ,  "arrlen"      ], //      [69,42] -- [69,42] 2
		[   WORD    , "arrpush"   ,  ID     ,  "arrpush"     ], //       [1] 69 -- [1,69]
		[   WORD    , "arrpop"    ,  ID     ,  "arrpop"      ], //       [1,69] -- [1] 69
		[   WORD    , "arrunshift",  ID     ,  "arrunshift"  ], //       [1] 69 -- [69,1]
		[   WORD    , "arrshift"  ,  ID     ,  "arrshift"    ], //       [1,69] -- [69] 1
		[   WORD    , "arrget"    ,  ID     ,  "arrget"      ], //      [8,9] 1 -- [8,9] 9
		[   WORD    , "arrset"    ,  ID     ,  "arrset"      ], //    [8,9] 1 5 -- [8,5]
		[   WORD    , "arrjoin"   ,  ID     ,  "arrjoin"     ], //  [1,2] [3,4] -- [1,2,3,4]
		[   WORD    , "arrsplit"  ,  ID     ,  "arrsplit"    ], //  [1,2,3,4] 3 -- [1,2,3] [4]

		[   WORD    , "bless"     ,  ID     ,  "bless"       ], //    [1,2,3] 9 -- [1,2,3,t:9]
		[   WORD    , "identify"  ,  ID     ,  "identify"    ], //  [1,2,3,t:9] -- [1,2,3,t:9] 9

		// graph
		[   WORD    , "thru"      ,  USRWORD,  "graph_thru"     ], //                  n -- n-input, n-output, pass-thru graph
		[   WORD    , "curvegen"  ,  USRWORD,  "graph_curvegen" ], //              curve -- curve generator graph
		[   OP1     , "~"         ,  USRWORD,  "graph_compseq"  ], //                A B -- A~B (see FAUST sequential composition)
		[   OP1     , ","         ,  USRWORD,  "graph_comppar"  ], //                A B -- A,B (see FAUST parallel composition)
		[   WORD    , "swizz"     ,  USRWORD,  "graph_swizz"    ], // G i1 i2 ... i(n) n -- n-output graph picking outputs i1 to i(n) from graph G
		[   OP1     , "@"         ,  USRWORD,  "graph_comprec"  ], //              A B n -- A@B with n samples of delay (similar to the FAUST "~" recursion operator)
		[   WORD    , "boxen"     ,  USRWORD,  "graph_boxen"    ], //                  G -- G (encapsulate "unit" for performance reasons)

		// debug symbols should be used only in tests

		[   WORD    , "assert"    ,  ID     ,  "DEBUG"       ], // pop value; crash if zero
		[   WORD    , "dump"      ,  ID     ,  "DEBUG"       ], // dump stack/rstack contents
		[   WORD    , "brk"       ,  ID     ,  "DEBUG"       ], // breakpoint
	];

	const lang_one_char_to_vm_op_map = {};
	const lang_builtin_word_to_vm_op_map = {};
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
			lang_one_char_to_vm_op_map[lid] = vm_op;
			break;
		case WORD:
			lang_builtin_word_to_vm_op_map[lid] = vm_op;
			break;
		case NUMBER: lang_number_vm_op = vm_op; break;
		case CALL:   lang_call_vm_op   = vm_op; break;
		default: throw new Error("unhandled ltype/0 in  " + JSON.stringify(line));
		}
	}
	if (!lang_number_vm_op) throw new Error("SANITY CHECK FAIL: no 'number' VM op");
	if (!lang_call_vm_op)   throw new Error("SANITY CHECK FAIL: no 'call' VM op");

	const new_word = () => ({ tokens: [], dbgpos: [] });

	let word = new_word();
	const root_word = word;
	delete(root_word.tokens); // throw error if code attempts to push tokens onto top-level word
	const word_stack = [word];

	const PUSH_NUMBER_IMM_INDEX_OF_WORD=401, BUILTIN_WORD=402, USER_WORD=403, PUSH_NUMBER_IMM=404, ONE_CHAR_OP=405;

	const src = open(path);

	const is_test_word = word => word.startsWith("test_");
	const is_main_word = word => word.startsWith("main_");

	let defword_state = 0;
	let word_sort_key_major = 0, word_sort_key_minor = 0;
	function push_token(typ, value, vm_op) {
		if (defword_state > 0) {
			if (typ !== USER_WORD) src.error("expected USER_WORD");
			word.name = value;
			if (defword_state === 1) {
				word_sort_key_major++;
				word_sort_key_minor = 0;
			} else if (defword_state === 2) {
				word.is_word_table_entry = true;
				if (word_sort_key_minor === 0) {
					word_sort_key_major++;
				}
				word_sort_key_minor++;
			} else {
				throw new Error("unexpected defword state " + defword_state);
			}
			word.sort_key = [word_sort_key_major, word_sort_key_minor];
			const word_scope = word_stack[word_stack.length-2];
			if (word_scope.words === undefined) word_scope.words = [];
			word_scope.words.push(word);
			defword_state = 0;
		} else {
			if (word_stack.length < 2) src.error("only word definitions (\":<word>\") are allowed at the top level");
			if (typ === USER_WORD && is_test_word(value)) src.error("'test_'-prefixed words are reserved for unit tests; they should not be called directly");
			if (vm_op[1] === USRWORD) {
				word.tokens.push([USER_WORD, vm_op[2], lang_call_vm_op]);
			} else {
				word.tokens.push([typ, value, vm_op]);
			}
			word.dbgpos.push(src.get_mark_pos());
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
			if (src.pop_file()) break;
		} else if (ch === "#") {
			src.mark();
			const directive = src.eat_while_match(["az"]);
			if (directive === "include") {
				src.skip_whitespace();
				src.mark();
				const include_path = src.eat_while_match(["az","AZ",".","09","_"]);
				src.push_file(include_path);
			} else {
				src.error("unhandled directive: " + directive);

			}
		} else if (ch === "`") { // push word index
			src.mark();
			const word = src.eat_while_match(["az","09","_"]);
			push_token(PUSH_NUMBER_IMM_INDEX_OF_WORD, word, lang_number_vm_op);
		} else if /*word*/ (match(ch, ["az","AZ","_"])) {
			const word = src.eat_while_match(["az","AZ","09","_"]);
			const builtin_vm_op = lang_builtin_word_to_vm_op_map[word];
			if (builtin_vm_op) {
				push_token(BUILTIN_WORD, word, builtin_vm_op);
			} else {
				push_token(USER_WORD, word, lang_call_vm_op);
			}
		} else if /*number */ (match(ch, ["09"])) {
			const number = src.eat_while_match(["09"]);
			push_token(PUSH_NUMBER_IMM, number, lang_number_vm_op);
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
		} else if (lang_one_char_to_vm_op_map[ch]) {
			push_token(ONE_CHAR_OP, ch, lang_one_char_to_vm_op_map[ch]);
		} else if /*comment*/ (ch === "(") {
			comment_depth++;
		} else {
			src.error("unexpected character");
		}
	}

	if (comment_depth !== 0) src.error("unterminated comment");

	if (word_stack.length !== 1) src.error("word definition was not terminated");
	if (word !== root_word) throw new Error("bad state");

	const vm4stub_lines = open("vm4stub.js").get_lines();

	let _lk_counter = 1;
	function trace_program(match_fn) {
		const lift_set = {};
		let prg_words = [];
		function lift(word_stack) {
			if (word_stack.length < 2) throw new Error("ASSERTION ERROR: top-level cannot be lifted");
			const word = word_stack[word_stack.length-1];

			if (word._lk === undefined) word._lk = _lk_counter++;
			if (lift_set[word._lk]) return;
			lift_set[word._lk] = true;

			for (const token of word.tokens) {
				const typ = token[0];
				const is_w  = (typ === USER_WORD);
				const is_wi = (typ === PUSH_NUMBER_IMM_INDEX_OF_WORD);
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
			prg_words.push(word);
		}

		function rec(word_stack) {
			const word = word_stack[word_stack.length-1];
			if (word.name && match_fn(word_stack.length-2, word.name)) {
				word.do_export = true;
				lift(word_stack);
			}
			for (let subword of word.words || []) rec([...word_stack, subword]);
		}
		rec([root_word]);

		prg_words.sort((a,b) => {
			const d0 = a.sort_key[0] - b.sort_key[0];
			if (d0 !== 0) return d0;
			const d1 = a.sort_key[1] - b.sort_key[1];
			return d1;
		});

		const required_vm_ids = {};
		const required_vm_other_ops = {};
		for (const w of prg_words) {
			for (const t of w.tokens) {
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

		const vm_words = [];
		const dbg_words = [];
		for (const w of prg_words) {
			let inst = [];
			for (const t of w.tokens) {
				//console.log(t);
				const opi = op_remap[t[2][0]];
				if (opi === undefined) throw new Error("op with no mapping");
				//console.log(opi);
				switch (t[0]) {
				case BUILTIN_WORD:
				case ONE_CHAR_OP:
					inst.push([opi]);
					break;
				case PUSH_NUMBER_IMM:
					inst.push([opi, parseInt(t[1], 10)]);
					break;
				case USER_WORD:
				case PUSH_NUMBER_IMM_INDEX_OF_WORD: {
					let word_index = -1;
					for (let i1 = 0; i1 < prg_words.length; i1++) {
						if (prg_words[i1].name === t[1]) {
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
			dbg_words.push(w.dbgpos);
		}

		const export_word_indices = [];
		const export_word_names = {};
		for (let i = 0; i < prg_words.length; i++) {
			const w = prg_words[i];
			if (!w.do_export) continue;
			export_word_indices.push(i);
			export_word_names[i] = w.name;
		}

		let vm, vm_src;
		{
			let piping = true;
			const expr0 = /\/\*ST4([:{}_])([^*]+)\*\//;
			const expr1 = /ST4_([A-Za-z0-9_]+)/;
			let pass_lines = [];

			let max_isa_index = -1;
			function accept_isa(index, context) {
				if (index <= max_isa_index) throw new Error("vm4stub.js not specified in \"ISA order\": " + context + " (index="+index+",max_isa_index="+max_isa_index+")");
				max_isa_index = index;
			}

			for (const line of vm4stub_lines) {
				const pass_line = () => pass_lines.push(line);
				function replace_id(id, vtype, join) {
					let xs = [];
					for (let i = 0; i < ISA.length; i++) {
						if (!(required_vm_other_ops[i] && ISA[i][2] === vtype)) continue;
						xs.push(ISA[i][3]);
						accept_isa(i, "at replacing " + id);
					}
					if (xs.length === 0) return;
					pass_lines.push(line.replace(id, JSON.stringify(xs.join(join))));
				}

				let mo0 = expr0.exec(line);
				if (mo0) {
					const typ = mo0[1];
					const id = mo0[2];

					let do_accept_isa = false;
					switch (typ) {
					case ":":
					case "{":
						do_accept_isa = true;
						break;
					}


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
								if (do_accept_isa) accept_isa(i, "in id section " + id);
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
			dbg_words,
			export_word_indices,
			export_word_names,
			vm_src,
		}
	}

	const ESC   = "\u001b";
	const NORM  =  ESC+"[0m";
	const FAIL  =  txt => ESC+"[1;93;41m"+txt+NORM; // bold; fg=bright yellow; bg=red
	const OK    =  txt => ESC+"[1;92m"+txt+NORM;    // bold; fg=bright green

	const test_prg = trace_program((depth,name) => is_test_word(name));
	//console.log(JSON.stringify(test_prg));
	for (const word_index of test_prg.export_word_indices) {
		const word_name = test_prg.export_word_names[word_index];
		try {
			const MAX_INSTRUCTIONS = 1e8;
			let vm_state = [
				word_index, 0,
				[], [], [],
				MAX_INSTRUCTIONS
			];
			while (vm_state[0] >= 0) {
				vm_state = test_prg.vm(test_prg.vm_words, vm_state);
				/*
				const [ pc0, pc1, stack, rstack, globals, counter ] = vm_state;
				if (pc0 >= 0) {
					console.log("breakpoint at " + JSON.stringify(test_prg.dbg_words[pc0][pc1-1]));
					console.log("STACK", stack);
					console.log("RSTACK", rstack);
				}
				*/
			}

			const [ pc0, pc1, stack, rstack, globals, counter ] = vm_state;
			//console.log([pc0,pc1]);
			//console.log(globals);
			const n_ops = MAX_INSTRUCTIONS - counter;
			if (stack.length !== 0 || rstack.length !== 0)  throw new Error("unclean stack after test: " + JSON.stringify([stack,"/R",rstack]));
			console.log(OK("TEST " + word_name + " OK (" + n_ops + "op)"));
		} catch (err) {
			console.log(FAIL("TEST ERROR in :" + word_name + " : " + err));
		}
	}

	//const main_prg = trace_program((depth,name) => depth === 0 && is_main_word(name));
	//console.log(main_prg);
}

function TIME_4ST_PROCESS(file) {
	TIME("4st processing: " + file  , _=>process_4st_file(file));
}

TIME_4ST_PROCESS("selftest.4st");
//TIME_4ST_PROCESS("main.4st");
