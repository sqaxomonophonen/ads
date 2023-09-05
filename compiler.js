function new_compiler(read_file_fn) {
	// Q: what's the best way to do enums in plain javascript?
	const WORD="WORD", ID="ID", NUMBER="NUMBER", CALL="CALL", OP1="OP1",
	INFIX="INFIX", PREFIX="PREFIX", MATH1="MATH1", USER_WORD="USER_WORD";

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

		// graph
		[   WORD    , "thru"      ,  USER_WORD ,  "graph_thru"     ], //                  n -- n-input, n-output, pass-thru graph
		[   WORD    , "curvegen"  ,  USER_WORD ,  "graph_curvegen" ], //              curve -- curve generator graph
		[   OP1     , "~"         ,  USER_WORD ,  "graph_compseq"  ], //                A B -- A~B (see FAUST sequential composition)
		[   OP1     , ","         ,  USER_WORD ,  "graph_comppar"  ], //                A B -- A,B (see FAUST parallel composition)
		[   WORD    , "swizz"     ,  USER_WORD ,  "graph_swizz"    ], // G i1 i2 ... i(n) n -- n-output graph picking outputs i1 to i(n) from graph G
		[   OP1     , "@"         ,  USER_WORD ,  "graph_comprec"  ], //              A B n -- A@B with n samples of delay (similar to the FAUST "~" recursion operator)
		[   WORD    , "boxen"     ,  USER_WORD ,  "graph_boxen"    ], //                  G -- G (encapsulate "unit" for performance reasons)

		// these should not exist in release builds; they're used for
		// unit/self testing, debugging, etc.

		[   WORD    , "assert"    ,  ID     ,  "DEBUG"       ], // pop value; crash if zero
		[   WORD    , "dump"      ,  ID     ,  "DEBUG"       ], // dump stack/rstack contents
		[   WORD    , "brk"       ,  ID     ,  "DEBUG"       ], // breakpoint
		[   WORD    , "DTGRAPH"   ,  ID     ,  "DEBUG"       ], // ( [] -- [] ) add "graph" type tag to array (unobservable inside program, but not in vm/outside)
	];

	let builtin_word_ii_map = {}, one_char_op_ii_map = {}, number_ii, call_ii;
	for (let i = 0; i < ISA.length; i++) {
		const [ typ, val ] = ISA[i];
		if (typ === WORD)   builtin_word_ii_map[val] = i;
		if (typ === OP1)    one_char_op_ii_map[val]  = i;
		if (typ === NUMBER) number_ii = i;
		if (typ === CALL)   call_ii = i;
	}
	if (number_ii === undefined || call_ii === undefined) throw new Error("XXX");

	const BEGIN_WORD="BEGIN_WORD", DIRECTIVE="DIRECTIVE",
	COMMENT="COMMENT", BUILTIN_WORD="BUILTIN_WORD", END_WORD="END_WORD",
	OP="OP", BEGIN_TABLE_WORD="BEGIN_TABLE_WORD",
	BEGIN_INLINE_WORD="BEGIN_INLINE_WORD", WORD_INDEX="WORD_INDEX",
	RESOLVE_WORD_INDEX="RESOLVE_WORD_INDEX", FLATTEN_INLINE="FLATTEN_INLINE"
	;

	function tokenize_line(line, pos) {
		let mark_pos, token_pos;

		if (pos === undefined) pos = 0;

		const get_char = () => line[pos++];

		const is_whitespace = (ch) => (ch === " " || ch === "\t");

		function skip_whitespace() {
			while (is_whitespace(get_char())) {}
			pos--;
		}

		function mark() {
			mark_pos = pos;
		}

		function mark_token_begin() {
			mark();
			token_pos = pos
		}

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
		}

		function eat_while_match(patterns) {
			for (;;) {
				const ch = get_char();
				if (ch === undefined || !match(ch, patterns)) break;
			}
			pos--;
			return line.slice(mark_pos, pos);
		}

		const ERR4 = (msg) => { throw ["ERR4",[null,null,token_pos],msg]; };

		let is_directive     = false;
		let is_non_directive = false;

		let tokens = [];
		function push_token(type, data0, data1, data2) {
			if (type === DIRECTIVE) {
				if (is_directive) ERR4("line cannot contain more than one directive");
				is_directive = true;
			} else if (type !== COMMENT) {
				is_non_directive = true;
			}
			if (is_directive && is_non_directive) ERR4("line cannot contain both directives and non-directives");

			let token = [[null, null, token_pos, pos], type];
			if (data0) {
				token.push(data0);
				if (data1) {
					token.push(data1);
					if (data2) {
						token.push(data2);
					}
				}
			}
			tokens.push(token);
		}

		const WORD_PATTERN0   = ["az","AZ","_"];
		const NUMBER_PATTERN  = ["09"];
		const WORD_PATTERN    = [...WORD_PATTERN0, ...NUMBER_PATTERN ];

		for (;;) {
			mark_token_begin();
			const ch = get_char();
			if (ch === undefined) {
				break;
			} else if (is_whitespace(ch)) {
				continue;
			} else if (ch === "#") {
				mark();
				const directive = eat_while_match(["az"]);
				if (directive === "include") {
					skip_whitespace();
					mark();
					const include_path = eat_while_match([...WORD_PATTERN, "."]);
					push_token(DIRECTIVE, "include", include_path);
				} else if (directive === "define") {
					skip_whitespace();
					mark();
					const defword = eat_while_match(WORD_PATTERN);
					push_token(DIRECTIVE, "define", defword, tokenize_line(pos));
					break;
				} else {
					ERR4("unhandled directive: " + directive);
				}
			} else if (ch === "\\") {
				mark();
				const word = eat_while_match(WORD_PATTERN);
				push_token(WORD_INDEX, word);
			} else if (match(ch, WORD_PATTERN0)) {
				const word = eat_while_match(WORD_PATTERN);
				if (builtin_word_ii_map[word] !== undefined) {
					push_token(BUILTIN_WORD, word);
				} else {
					push_token(USER_WORD, word);
				}
			} else if (match(ch, NUMBER_PATTERN)) {
				push_token(NUMBER, eat_while_match(NUMBER_PATTERN));
			} else if (ch === ":") {
				let type = null;
				const ch2 = get_char();
				if (ch2 === "@" || ch2 === "=") {
					type = ch2;
				} else {
					pos--;
				}
				skip_whitespace();
				mark();
				const word = eat_while_match(WORD_PATTERN)
				if (word.trim().length === 0) ERR4("expected word");
				if (type === "@") {
					push_token(BEGIN_TABLE_WORD, word);
				} else if (type === "=") {
					push_token(BEGIN_INLINE_WORD, word);
				} else if (type === null) {
					push_token(BEGIN_WORD, word);
				} else {
					throw new Error("UNREACHABLE");
				}
			} else if (ch === ";") {
				push_token(END_WORD);
			} else if (one_char_op_ii_map[ch] !== undefined) {
				push_token(OP, ch);
			} else if (ch === "(") {
				let depth = 1;
				while (depth > 0) {
					const ch2 = get_char();
					if (ch2 === undefined) break;
					depth += (ch2 === "(") - (ch2 === ")");
				}
				if (depth > 0) ERR4("comment not terminated (multi-line comments are not possible)");
				push_token(COMMENT);
			} else {
				ERR4("unexpected character: " + ch);
			}
		}

		return tokens;
	}

	function ERR4_PATCH(e, patch) {
		if (e.length !== undefined && e[0] === "ERR4") {
			for (let i = 0; i < patch.length; i++) {
				if (patch[i] === null) continue;
				e[1][i] = patch[i];
			}
			return e;
		} else {
			return e;
		}
	}

	function tokenize_lines(lines) {
		let tokens = [];
		for (let line_number = 0; line_number < lines.length; line_number++) {
			const line = lines[line_number];
			try {
				for (const line_token of tokenize_line(line)) {
					line_token[0][1] = line_number;
					tokens.push(line_token);
				}
			} catch (e) {
				throw ERR4_PATCH(e, [null, line_number, null]);
			}
		}
		return tokens;
	}

	const tokenize_string = (filename, string) => {
		try {
			return tokenize_lines(string.split("\n")).map(x => { x[0][0] = filename; return x; });
		} catch (e) {
			throw ERR4_PATCH(e, [filename, null, null]);
		}
	};

	const tokenize_file = (filename) => tokenize_string(filename, read_file_fn(filename));
	function preprocess_file(filename, header_tokens) {
		let stack = [];
		const push = (toks) => stack.push([0,toks]);
		push(tokenize_file(filename));
		if (header_tokens) push(header_tokens);
		let tokens = [];
		while (stack.length > 0) {
			let e = stack[stack.length-1];
			const file_tokens = e[1];
			const file_token = file_tokens[e[0]++];
			if (file_token === undefined) {
				stack.pop();
			} else if (file_token[1] === DIRECTIVE) {
				const dt = file_token[2];
				if (dt === "include") {
					push(tokenize_file(file_token[3]));
				} else {
					throw new Error("unhandled directive type: " + dt);
				}
			} else {
				tokens.push(file_token);
			}
		}
		return tokens;
	}

	const is_test_word = word => word.startsWith("test_");
	const is_main_word = word => word.startsWith("main_");

	function compile(filename, is_release) {
		let preamble = "";
		preamble += ":= DTGRAPH" + (is_release ? "" : " _DTGRAPH") + " ;\n";
		const raw_tokens = preprocess_file(filename, tokenize_string("<preamble.4st>", preamble));

		const token_it = (_ => { let i=0; return _ => raw_tokens[i++]; })();
		let word_serial = 0;

		function get_word_tree(depth) {
			const word = {
				subwords: [],
				serial: ++word_serial,
			};
			if (depth > 0) {
				word.ops = [];
				word.oppos = [];
			}

			let end_of_word = false;
			while (!end_of_word) {
				const tok = token_it();
				if (!tok) {
					if (depth > 0) throw new Error("end of token stream inside word (depth="+depth+")");
					break;
				}
				const [ pos, typ, arg0, arg1 ] = tok;
				const push_op = (op) => {
					if (!word.ops) throw ["ERR4", tok[0], "op in root scope not allowed"];
					if (typeof op[0] !== "number") throw new Error("sanity check failed");
					word.ops.push(op);
					word.oppos.push(pos);
				};
				switch (typ) {
				case DIRECTIVE: throw new Error("should not see directives here (missing preprocessor)");
				case COMMENT: break; // skip

				case BEGIN_WORD:
				case BEGIN_TABLE_WORD:
				case BEGIN_INLINE_WORD: {
					const subword = get_word_tree((depth|0)+1);
					subword.name = arg0;
					if (typ === BEGIN_TABLE_WORD)  subword.is_table_word = true;
					if (typ === BEGIN_INLINE_WORD) subword.is_inline_word = true;
					word.subwords.push(subword);
				} break;
				case END_WORD:
					end_of_word = true;
					break;

				case NUMBER:         push_op([number_ii, parseInt(arg0,10)]);  break;
				case OP:             push_op([one_char_op_ii_map[arg0]]);      break;
				case BUILTIN_WORD:   push_op([builtin_word_ii_map[arg0]]);     break;

				case USER_WORD:
					push_op([call_ii, [RESOLVE_WORD_INDEX, arg0]]);
					break;
				case WORD_INDEX:
					push_op([number_ii, [RESOLVE_WORD_INDEX, arg0]]);
					break;

				default: throw new Error("unhandled token: " + JSON.stringify(tok));
				}
			}
			return word;
		}

		let root_word = get_word_tree(raw_tokens);

		const vm4stub_lines = read_file_fn("vm4stub.js").split("\n");

		function trace_program(match_fn) {
			const lift_set = new Set();
			let prg_words = [];
			function uplift_word(word_stack, inline_ops) {
				if (word_stack.length < 2) throw new Error("ASSERTION ERROR: top-level cannot be lifted");
				const word = word_stack[word_stack.length-1];

				if (!inline_ops) {
					// XXX don't really know if refcount is
					// useful...
					//if (word.refcount === undefined) word.refcount = 0;
					//word.refcount++;
					if (lift_set.has(word)) return;
					lift_set.add(word);
				}

				for (let opi = 0; opi < word.ops.length; opi++) {
					let op = word.ops[opi];
					let op_was_inlined = false;
					const maybe_inline = () => {
						if (op_was_inlined) throw new Error("XXX 2+ inlines?");
						if (inline_ops) {
							inline_ops.push(op);
						}
						op_was_inlined = true;
					};

					// some built-in words or ops map to
					// standard library functions.
					// resolve/patch that here
					let ise = ISA[op[0]];
					if (ise[2] === USER_WORD) {
						op = word.ops[opi] = [call_ii, [RESOLVE_WORD_INDEX, ise[3]]];
					}

					if (!(typeof op[1] === "object" && op[1][0] === RESOLVE_WORD_INDEX)) {
						maybe_inline();
						continue;
					}
					const ii = op[0], name = op[1][1];
					let found = false;
					for (let i0 = word_stack.length-1; i0 >= 0 && !found; i0--) {
						const w0 = word_stack[i0];
						const w0s = w0.subwords || [];
						for (let i1 = 0; i1 < w0s.length && !found; i1++) {
							const w1 = w0s[i1];
							if (w1.name === name) {
								found = true;
								if (ii === number_ii && w1.is_table_word) {
									maybe_inline();
									// trace out word table
									let left, right;
									for (left  = i1; left >= 0          && w0s[left].is_table_word; left--) {}
									left++;
									for (right = i1; right < w0s.length && w0s[right].is_table_word; right++) {}
									right--
									for (let i2 = left; i2 <= right; i2++) {
										const w2 = w0s[i2];
										if (w2.is_inline_word) throw new Error("XXX");
										uplift_word([...word_stack.slice(0, i0+1), w2]);
									}
								} else if (ii === call_ii) {
									if (w1.is_inline_word) {
										if (!inline_ops) inline_ops = [];
									} else {
										maybe_inline();
										inline_ops = undefined;
									}
									uplift_word([...word_stack.slice(0, i0+1), w1], inline_ops);
									if (w1.is_inline_word) {
										word.ops[opi] = [FLATTEN_INLINE, inline_ops];
									}
								} else {
									throw new Error("UNREACHABLE");
								}
							}
						}
					}
					if (!found) throw new Error("word not found in scope: " + name);
				}

				if (!inline_ops) prg_words.push(word);
			}

			function rec(word_stack) {
				const word = word_stack[word_stack.length-1];
				if (word.name && match_fn(word_stack.length-2, word.name)) {
					word.do_export = true;
					uplift_word(word_stack);
				}
				for (let subword of word.subwords || []) rec([...word_stack, subword]);
			}
			rec([root_word]);

			prg_words.sort((a,b) => a.serial - b.serial);

			// do a bunch of things:
			//  - flatten inlines
			//  - resolve word indices
			//  - figure out which VM ops are required
			const required_vm_ids = {};
			const required_vm_other_ops = {};
			for (const word of prg_words) {
				for (let opi = 0; opi < word.ops.length; opi++) {
					let op = word.ops[opi];
					if (op[0] === FLATTEN_INLINE) {
						word.ops = word.ops.slice(0, opi).concat(op[1]).concat(word.ops.slice(opi+1));
						throw new Error("XXX also handle word.oppos");
						opi--;
						continue;
					}

					const ii = op[0];
					const ise = ISA[ii];
					const vtype = ise[2];
					if (vtype === USER_WORD) {
						throw new Error("XXX should've been handled earlier");
					} else if (vtype === ID) {
						required_vm_ids[ise[3]] = true;
					} else {
						required_vm_other_ops[ii] = true;
					}

					if (typeof op[1] === "object" && op[1][0] === RESOLVE_WORD_INDEX) {
						let resolved = false;
						const name = op[1][1];
						for (let wi = 0; wi < prg_words.length; wi++) {
							if (prg_words[wi].name === name) {
								op[1] = wi;
								resolved = true;
								break;
							}
						}
						if (!resolved) throw new Error("could not resolve word: " + name);
					}
				}
			}

			// compact ISA by removing unused ops

			let op_remap = {};
			{
				let op_idx = 0;
				for (let ii = 0; ii < ISA.length; ii++) {
					const ise = ISA[ii];
					const keep = (ise[2] === ID && (ise[3] === "STATIC" || required_vm_ids[ise[3]])) || required_vm_other_ops[ii];
					if (keep) op_remap[ii] = op_idx++;
				}
			}

			const vm_words = [];
			const dbg_words = [];
			for (const word of prg_words) {
				vm_words.push(word.ops.map(op => [op_remap[op[0]], ...op.slice(1)]));
				dbg_words.push(word.oppos);
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
			};
		}

		return {
			trace_program,
		};
	};

	return {
		tokenize_line,
		tokenize_lines,
		tokenize_string,
		tokenize_file,
		preprocess_file,
		compile,
		compile_debug:   f=>compile(f,false),
		compile_release: f=>compile(f,true),
		is_test_word,
		is_main_word,
	};
}

if (typeof module !== 'undefined' && module.exports) module.exports = new_compiler;
