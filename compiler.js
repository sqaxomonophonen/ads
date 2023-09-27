function new_compiler(read_file_fn) {
	// Q: what's the best way to do enums in plain javascript?
	const WORD="WORD", ID="ID", NUMBER="NUMBER", CALL="CALL", OP1="OP1",
	INFIX="INFIX", PREFIX="PREFIX", MATH1="MATH1", USER_WORD="USER_WORD";

	const FLAG_KEYWORD = 1<<0; // syntax highlight thing; has no semantic meaning

	const ISA = [
		// NOTE: ISA order must match vm4stub.js order

		// these ops are always in the vm (ID=STATIC)

		[   WORD    , "return"    ,  ID     ,  "STATIC"      , FLAG_KEYWORD ],
		[   WORD    , "if"        ,  ID     ,  "STATIC"      , FLAG_KEYWORD ],
		[   WORD    , "else"      ,  ID     ,  "STATIC"      , FLAG_KEYWORD ],
		[   WORD    , "endif"     ,  ID     ,  "STATIC"      , FLAG_KEYWORD ],

		// the remaining ops can be compiled out of the VM if unused:

		[   NUMBER  ,             ,  ID     ,  "PUSH_IMM"    ],
		[   WORD    , "times"     ,  ID     ,  "TIMES_LOOP"  , FLAG_KEYWORD ],
		[   WORD    , "loop"      ,  ID     ,  "TIMES_LOOP"  , FLAG_KEYWORD ],
		[   WORD    , "do"        ,  ID     ,  "DO_WHILE"    , FLAG_KEYWORD ],
		[   WORD    , "while"     ,  ID     ,  "DO_WHILE"    , FLAG_KEYWORD ],
		[   CALL    ,             ,  ID     ,  "CALL_IMM"    ],
		[   WORD    , "call"      ,  ID     ,  "CALL_POP"    ],
		[   WORD    , "pick"      ,  ID     ,  "pick"        ],
		[   WORD    , "drop"      ,  ID     ,  "drop"        ],
		[   WORD    , "nrot"      ,  ID     ,  "nrot"        ], // called "roll" in forth
		[   WORD    , "ntro"      ,  ID     ,  "ntro"        ],
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

		// graph (all backed by lib.4st user words)
		[   WORD    , "thru"      ,  USER_WORD ,  "graph_thru"     ], //                  n -- n-input, n-output, pass-thru graph
		[   WORD    , "curvegen"  ,  USER_WORD ,  "graph_curvegen" ], //              curve -- curve generator graph
		[   OP1     , "~"         ,  USER_WORD ,  "graph_compseq"  ], //                A B -- A~B (see FAUST sequential composition)
		[   OP1     , ","         ,  USER_WORD ,  "graph_comppar"  ], //                A B -- A,B (see FAUST parallel composition)
		[   WORD    , "swizz"     ,  USER_WORD ,  "graph_swizz"    ], // G i1 i2 ... i(n) n -- n-output graph picking outputs i1 to i(n) from graph G
		[   OP1     , "@"         ,  USER_WORD ,  "graph_comprec"  ], //              A B n -- A@B with n samples of delay (similar to the FAUST "~" recursion operator)
		[   WORD    , "boxen"     ,  USER_WORD ,  "graph_boxen"    ], //                  G -- G (encapsulate "unit" for performance reasons)

		// these should not exist in release builds; they're used for
		// unit/self testing, debugging, etc.

		[   WORD    , "nop"       ,  ID     ,  "DEBUG"       ], // eats a cycle nom nom
		[   WORD    , "assert"    ,  ID     ,  "DEBUG"       ], // pop value; crash if zero
		[   WORD    , "dump"      ,  ID     ,  "DEBUG"       ], // dump stack/rstack contents
		[   WORD    , "brk"       ,  ID     ,  "DEBUG"       ], // breakpoint
		[   WORD    , "DTGRAPH"   ,  ID     ,  "DEBUG"       ], // ( [] -- [] ) add "graph" type tag to array (unobservable inside program, but not in vm/outside)
	];

	let builtin_word_ii_map = {}, one_char_op_ii_map = {}, number_ii, call_ii;
	const keyword_set = {};
	for (let i = 0; i < ISA.length; i++) {
		const ise = ISA[i];
		const [ typ, val ] = ise;
		if (typ === WORD)   builtin_word_ii_map[val] = i;
		if (typ === OP1)    one_char_op_ii_map[val]  = i;
		if (typ === NUMBER) number_ii = i;
		if (typ === CALL)   call_ii = i;
		if (ise[4] & FLAG_KEYWORD) keyword_set[val] = 1;
	}
	if (number_ii === undefined || call_ii === undefined) throw new Error("XXX");

	const BEGIN_WORD="BEGIN_WORD", BEGIN_TABLE_WORD="BEGIN_TABLE_WORD",
	BEGIN_INLINE_WORD="BEGIN_INLINE_WORD", END_WORD="END_WORD",
	DIRECTIVE="DIRECTIVE", COMMENT="COMMENT", BUILTIN_WORD="BUILTIN_WORD",
	OP="OP", WORD_INDEX="WORD_INDEX",
	RESOLVE_WORD_INDEX="RESOLVE_WORD_INDEX",
	FLATTEN_INLINE="FLATTEN_INLINE", TOKEN_ERROR="TOKEN_ERROR"
	;

	const chain_state = (state) => state ? state : { tokens: [], positions: [], error_latch: false };

	function tokenize_line(line, state) {
		state = chain_state(state);

		let mark_pos, token_pos;
		let pos = 0;

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

		const get_position = () => [null,null,token_pos,pos];

		let is_directive     = false;
		let is_non_directive = false;

		function push_error_token(message) {
			state.tokens.push([TOKEN_ERROR, message]);
			state.positions.push(get_position());
			state.error_latch = true;
		}

		function push_token(type, data0, data1, data2) {
			if (type === DIRECTIVE) {
				if (is_directive) return push_error_token("line cannot contain more than one directive");
				is_directive = true;
			} else if (type !== COMMENT) {
				is_non_directive = true;
			}
			if (is_directive && is_non_directive) return push_error_token("line cannot contain both directives and non-directives");

			let token = [type];
			if (data0) {
				token.push(data0);
				if (data1) {
					token.push(data1);
					if (data2) {
						token.push(data2);
					}
				}
			}
			state.tokens.push(token);

			state.positions.push(get_position());
		}

		const WORD_PATTERN0   = ["az","AZ","_"];
		const NUMBER_PATTERN  = ["09"];
		const WORD_PATTERN    = [...WORD_PATTERN0, ...NUMBER_PATTERN];

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
				} else {
					push_error_token("unhandled directive: " + directive);
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
				if (word.trim().length === 0) {
					push_error_token("expected word");
				} else if (type === "@") {
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
				if (depth > 0) {
					push_error_token("comment not terminated before newline (this language doesn't have multi-line comments)")
				} else {
					push_token(COMMENT);
				}
			} else {
				push_error_token("unexpected character: " + ch);
			}
		}

		return state;
	}

	function tokenize_lines(lines, state) {
		state = chain_state(state);
		for (let line_number = 0; line_number < lines.length; line_number++) {
			const i0 = state.positions.length;
			state = tokenize_line(lines[line_number], state);
			// patch in line numbers
			for (let i = i0; i < state.positions.length; i++) {
				state.positions[i][1] = line_number;
			}
		}
		return state;
	}

	function tokenize_string(filename, string, state) {
		state = chain_state(state);
		state = tokenize_lines(string.split("\n"), state)
		// patch in filename
		for (let i = 0; i < state.positions.length; i++) {
			state.positions[i][0] = filename;
		}
		return state;
	}

	const tokenize_file = (filename, state) => tokenize_string(filename, read_file_fn(filename, state));

	// similar to tokenize_file(), but resolves #include statements
	function preprocess_from_entry_file(filename, flattened_state) {
		flattened_state = chain_state(flattened_state);
		let stack = [], top;
		const set_top = () => { top = stack[stack.length-1]; };
		const push = (state) => { stack.push([0,state]); set_top(); };
		const pop = () => { stack.pop(); set_top(); }
		push(tokenize_file(filename));
		while (top) {
			const topi = top[0]++;
			if (top.error_latch) flattened_state.error_latch = true;
			const top_state = top[1];
			const token = top_state.tokens[topi];
			if (token === undefined) {
				pop();
				continue;
			} else if (token[0] === DIRECTIVE) {
				if (token[1] === "include") {
					push(tokenize_file(token[2]));
				} else {
					throw new Error("unhandled directive type: " + dt);
				}
			} else {
				flattened_state.tokens.push(token);
				flattened_state.positions.push(top_state.positions[topi]);
			}
		}
		return flattened_state;
	}

	const is_test_word = word => word.startsWith("test_");
	const is_main_word = word => word.startsWith("main_");

	function span_contains(line0, col0, line1, col1, line, col) {
		if (line < line0 || line1 < line) return false;
		if (line0 < line && line < line1) return true;
		if (line === line0 && line === line1) return col0 <= col && col < col1;
		if (line === line0) return col0 <= col;
		if (line === line1) return col < col1;
		throw new Error("UNREACHABLE");
	}

	function get_word_spans(state) {
		const n = state.positions.length;
		let word_stack = [];
		let word;
		let word_spans = [];
		for (let i = 0; i < n; i++) {
			const token = state.tokens[i];
			const t = token[0];
			const pos = state.positions[i];
			if (t === BEGIN_WORD || t === BEGIN_TABLE_WORD || t === BEGIN_INLINE_WORD) {
				word = {
					name:     token[1],
					subwords: [],
					filename: pos[0],
					line0:    pos[1],
					col0:     pos[2],
				};
				if (word_stack.length === 0) {
					word_spans.push(word);
				} else {
					word_stack[word_stack.length-1].subwords.push(word);
				}
				word_stack.push(word);
			}
			if (t === END_WORD) {
				word.line1 = pos[1];
				word.col1 = pos[3];
				word_stack.pop();
				word = word_stack.length > 0 ? word_stack[word_stack.length-1] : undefined;
			}
		}
		return word_spans;
	}

	function find_word_path(state, filename, line, column) {
		const words = get_word_spans(state);
		function find(words) {
			for (const word of words) {
				if (word.filename !== filename || !span_contains(word.line0, word.col0, word.line1, word.col1, line, column)) {
					continue;
				}
				const sub = find(word.subwords);
				return word.name + (sub ? ":"+sub : "");
			}
			return "";
		}
		return find(words);
	}

	function compile(filename, is_release) {
		let preamble = "";
		preamble += ":= DTGRAPH" + (is_release ? "" : " _DTGRAPH") + " ;\n";
		let tokenizer_state = tokenize_string("<preamble.4st>", preamble);
		tokenizer_state = preprocess_from_entry_file(filename, tokenizer_state);

		let token_cursor = -1;
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
				token_cursor++;
				const tok = tokenizer_state.tokens[token_cursor];
				const pos = tokenizer_state.positions[token_cursor];
				if (!tok) {
					if (depth > 0) {
						throw [null, "end of token stream inside word (depth="+depth+")"];
					}
					break;
				}
				const [ typ, arg0, arg1 ] = tok;
				const push_op = (op) => {
					if (!word.ops) throw [pos, "op in root scope not allowed"];
					if (typeof op[0] !== "number") throw new Error("sanity check failed");
					word.ops.push(op);
					word.oppos.push(pos);
				};
				switch (typ) {
				case DIRECTIVE: throw new Error("should not see directives here (missing preprocessor)");
				case TOKEN_ERROR: throw [pos, arg0];
				case COMMENT: break; // skip

				case BEGIN_WORD:
				case BEGIN_TABLE_WORD:
				case BEGIN_INLINE_WORD: {
					const subword = get_word_tree(depth+1);
					subword.name = arg0;
					const pos1 = tokenizer_state.positions[token_cursor];
					subword.span = [
						[ pos[0],  pos[1],  pos[2]],
						[pos1[0], pos1[1], pos1[3]],
					];
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

		let root_word = get_word_tree(0);

		const vm4stub_lines = read_file_fn("vm4stub.js").split("\n");

		function trace_program(match_word_path_fn, is_debug) {
			const lift_set = new Set();
			let prg_words = [];
			function uplift_word(word_stack, inline_ops) {
				if (word_stack.length < 2) throw new Error("ASSERTION ERROR: top-level cannot be lifted");
				const word = word_stack[word_stack.length-1];

				if (!inline_ops) {
					if (lift_set.has(word)) return;
					lift_set.add(word);
				}

				for (let opi = 0; opi < word.ops.length; opi++) {
					let op = word.ops[opi];
					let op_was_inlined = false;
					const maybe_inline = () => {
						if (op_was_inlined) throw new Error("XXX 2+ inlines?");
						if (inline_ops) {
							inline_ops.push([op, word.oppos[opi]]);
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
						const w0s = word_stack[i0].subwords || [];
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
								} else if (ii === number_ii) {
									throw new Error("address (\\) can only be used on table words");
								} else if (ii === call_ii) {
									let pass_inline_ops = inline_ops;
									if (w1.is_inline_word) {
										if (!pass_inline_ops) pass_inline_ops = [];
									} else {
										maybe_inline();
										pass_inline_ops = undefined;
									}
									uplift_word([...word_stack.slice(0, i0+1), w1], pass_inline_ops);
									if (w1.is_inline_word) {
										word.ops[opi] = [
											FLATTEN_INLINE,
											pass_inline_ops.map(x=>x[0]),
											pass_inline_ops.map(x=>x[1])
										];
									}
								} else {
									throw new Error("UNREACHABLE/" + ii);
								}
							}
						}
					}
					if (!found) throw [word.oppos[opi], "word not found in scope: " + name];
				}

				if (!inline_ops) prg_words.push(word);
			}

			function rec(word_stack) {
				const word = word_stack[word_stack.length-1];
				if (word.name && match_word_path_fn(word_stack.slice(1).map(x=>x.name).join(":"))) {
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
			let op_remap; // ISA index to VM opcode map (populated here:)
			{
				const required_vm_ids = {};
				const required_vm_other_ops = {};
				for (const word of prg_words) {
					for (let opi = 0; opi < word.ops.length; opi++) {
						let op = word.ops[opi];
						if (op[0] === FLATTEN_INLINE) {
							word.ops   = word.ops.slice(0, opi).concat(op[1]).concat(word.ops.slice(opi+1));
							word.oppos = word.oppos.slice(0, opi).concat(op[2]).concat(word.oppos.slice(opi+1));
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

				// populate op_remap with ISA index => VM op
				// (only for ops the VM needs according to the
				// program)
				op_remap = {};
				let op_idx = 0;
				for (let ii = 0; ii < ISA.length; ii++) {
					const ise = ISA[ii];
					const keep = (ise[2] === ID && (ise[3] === "STATIC" || (is_debug && ise[3] === "DEBUG") || required_vm_ids[ise[3]])) || required_vm_other_ops[ii];
					if (keep) {
						op_remap[ii] = op_idx++;
					}
				}
			}
			const include_op = (id) => op_remap[id] !== undefined;

			const vm_words = [];
			const dbg_words = [];
			const vm_word_spans = [];
			for (const word of prg_words) {
				vm_words.push(word.ops.map(op => [op_remap[op[0]], ...op.slice(1)]));
				dbg_words.push(word.oppos);
				vm_word_spans.push(word.span);
			}

			const export_word_indices = [];
			const export_word_names = [];
			for (let i = 0; i < prg_words.length; i++) {
				const w = prg_words[i];
				if (!w.do_export) continue;
				export_word_indices.push(i);
				export_word_names.push(w.name);
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
							if (!(include_op(i) && ISA[i][2] === vtype)) continue;
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
								if (line[3] === id && include_op(i)) {
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

			if (vm_words.length !== dbg_words.length) throw new Error("vm/dbg mismatch");
			for (let i = 0; i < vm_words.length; i++) if (vm_words[i].length !== dbg_words[i].length) throw new Error("vm/dbg mismatch");

			const opresolv = (() => {
				let cache = {};
				return (typ,op) => {
					const key = JSON.stringify([typ,op]);
					if (cache[key] === undefined) {
						let opcode;
						for (let i = 0; i < ISA.length; i++) {
							const ise = ISA[i];
							if (ise[0] !== typ || ise[1] !== op) continue;
							opcode = op_remap[i];
							break;
						}
						if (opcode === undefined) opcode = null;
						cache[key] = opcode;
					}
					return cache[key];
				};
			})();

			const [
				OP_BRK,
				OP_ASSERT,
				OP_RETURN,
			] = [
				"brk",
				"assert",
				"return",
			].map(name => opresolv(WORD, name));

			function get_op(word_op_pos) {
				const [ wi, oi ] = word_op_pos;
				if (!(0 <= wi && wi < vm_words.length)) throw new Error("invalid word index: " + wi);
				const ops = vm_words[wi];
				// XXX I'm slightly scared about modifying the
				// actual program here... but how else do I
				// support setting a breakpoint at end-of-word
				// plus one (which is an implicit return)?
				if (oi === ops.length) ops[oi] = [OP_RETURN];
				return ops[oi]
			}

			function bless(raw) {
				let self;
				const PC0=0, PC1=1, STACK=2, RSTACK=3, GLOBALS=4,
				      CYCLE_COUNT=5, VALUE_TYPE_TAG_MAP=6;
				const pc0 = () => raw[PC0];
				const pc1 = () => raw[PC1];
				const pc = (delta) => [pc0(), pc1()+(delta|0)];
				const get_pc_op = (d) => vm_words[pc0()][pc1()+(d|0)];
				const get_position = () => dbg_words[pc0()][pc1()-1];
				const get_cycle_counter =  () => raw[CYCLE_COUNT];
				const set_cycle_counter = (n) => raw[CYCLE_COUNT] = Math.ceil(n);
				let dump_callback_fn, halting_solution, last_exception, snapshot0;

				const has_ended = () => raw[PC0] < 0;
				const has_cycles_left = () => raw[CYCLE_COUNT] > 0;
				const can_run = () => !has_ended() && has_cycles_left();

				function assert_has_not_ended() {
					if (has_ended()) throw new Error("cannot run(); program has ended");
					if (last_exception) throw new Error("cannot run(); re-entry after exception (" + last_exception + ")");
				}

				function assert_has_started() {
					if (raw[PC1] < 0) throw new Error("cannot run(); program has not started (can happen if you attempt single-stepping before running?)");
				}

				function assert_is_running() {
					assert_has_not_ended();
					assert_has_started();
				}

				function assert_has_cycles_left() {
					if (!has_cycles_left()) throw new Error("cannot run(); no cycles left");
				}

				function export_tagged(x) {
					// XXX this function should probably preserve references? it
					// serves two needs:
					//  - exporting the VM state so the "frontend" can display it
					//  - save_snapshot()
					// the "frontend" doesn't really care whether it receives a
					// deep copy or something that preserves references (although
					// it's possible it could speed up rendering for DRY-reasons?),
					// but if a snapshot is restored from a deep copy, it can lead
					// to subtle bugs with code that depends on having references.
					// see also ":test_arrays_are_references...;" in "selftest.4st".
					const tagmap = raw[VALUE_TYPE_TAG_MAP];
					function maprec(x) {
						if (x instanceof Array) {
							const y = x.map(maprec);
							if (tagmap.has(x)) {
								return {
									t: tagmap.get(x),
									x: y,
								};
							} else {
								return y;
							}
						} else {
							if (typeof x === "object" && x !== null) throw new Error("unexpected/unsafe value to export like this: " + JSON.stringify(x));
							return x;
						}
					}
					return maprec(x);
				}

				function get_tagged_stack() {
					return export_tagged(raw[STACK]);
				}

				function get_tagged_globals() {
					return export_tagged(raw[GLOBALS]);
				}

				function import_tagged(x, value_type_tag_map) {
					function maprec(x) {
						//> {} instanceof Object === true
						//> {} instanceof Array  === false
						//> [] instanceof Array  === true
						//> [] instanceof Object === true
						if (x instanceof Object && x !== null && !(x instanceof Array)) {
							const tag = x.t;
							if (tag === undefined) throw new Error("sanity check failed; what kind of object is this? " + JSON.stringify(x));
							const value = x.x; // O_o
							value_type_tag_map.set(value, tag);
							return value;
						} else if (x instanceof Array) {
							return x.map(maprec);
						} else {
							return x;
						}

					}
					return maprec(x);
				}

				function save_snapshot() {
					// XXX see deep-copy vs preserve-references discussion in export_tagged()
					return {
						pc0:             raw[PC0],
						pc1:             raw[PC1],
						tagged_stack:    get_tagged_stack(),
						rstack:          JSON.parse(JSON.stringify(raw[RSTACK])), // TODO maybe do something less stupid? :)
						tagged_globals:  get_tagged_globals(),
						cycle_count:     raw[CYCLE_COUNT],
					};
				}

				function restore_snapshot(snap) {
					// XXX see deep-copy vs preserve-references discussion in export_tagged()
					raw[PC0] = snap.pc0;
					raw[PC1] = snap.pc1;
					raw[RSTACK] = snap.rstack;
					raw[CYCLE_COUNT] = snap.cycle_count;
					let value_type_tag_map = new WeakMap();
					raw[STACK]   = import_tagged(snap.tagged_stack,   value_type_tag_map);
					raw[GLOBALS] = import_tagged(snap.tagged_globals, value_type_tag_map);
					raw[VALUE_TYPE_TAG_MAP] = value_type_tag_map;
				}

				function rawrun(usrbrk) {
					assert_is_running();
					let raw_halting_solution;
					[ raw, raw_halting_solution, last_exception ] = vm(vm_words, raw, dump_callback, usrbrk);
					// "unpack" halting_solution from raw_halting_solution
					halting_solution = (() => {
						switch (raw_halting_solution[0]) {
						case "usrbrk":
						case "end":
						case "outofgas":
							return raw_halting_solution[0];
						case "_opcode": {
							// VM stopped due to a "stopping op", but the VM only knows the opcode, so
							// translate it into a useful name here
							const stopcode = raw_halting_solution[1];
							switch (stopcode) {
							case OP_BRK:     return "brk";
							case OP_ASSERT:  return "assert";
							default: {
								let isa_index;
								for (const k in op_remap) {
									if (op_remap[k] === stopcode) {
										isa_index = k;
										break;
									}
								}
								let extra = "";
								if (isa_index !== undefined) {
									extra = " / ISE="+JSON.stringify(ISA[isa_index]);
								}
								throw new Error("unhandled stopcode " + stopcode + extra);
							}; break;
							}
						}; break;
						default: throw new Error("unexpected raw halting solution: " + JSON.stringify(raw_halting_solution));
						}
					})();
				}

				function dump_callback(_raw) {
					if (dump_callback_fn) {
						raw = _raw;
						dump_callback_fn(self);
					}
				}

				function forward_single_step(d) {
					assert_is_running();
					const tmp = raw[CYCLE_COUNT];
					raw[CYCLE_COUNT] = d;
					rawrun();
					raw[CYCLE_COUNT] = tmp-d;
				}

				function run(usrbrk) {
					assert_has_not_ended();
					assert_has_cycles_left();
					// a bit of a hack to handle when pc===usrbrk. this can mean two things:
					//  - we want to continue until pc===usrbrk again
					//  - this is a usrbrk at the very start of the program
					const first_entry = (raw[PC1] === -1);
					if (first_entry) {
						raw[PC1] = 0;
						snapshot0 = save_snapshot();
					}
					assert_has_started();
					if (!first_entry && usrbrk && raw[PC0] === usrbrk[0] && raw[PC1] === usrbrk[1]) {
						forward_single_step(1);
					}
					rawrun(usrbrk);
					return halting_solution;
				}

				function single_step(d) {
					assert_is_running();
					if (d > 0) {
						forward_single_step(d);
					} else if (d < 0) {
						// to step backwards, restore previous snapshot and run
						// until desired cycle count. NOTE: if stepping starts
						// getting slow, maybe look into saving snapshots that are
						// closer to PC; here the initial snapshot is used
						const c0 = raw[CYCLE_COUNT];
						restore_snapshot(snapshot0);
						const c1 = raw[CYCLE_COUNT] - c0;
						const dc = c1 + d;
						const tmp = raw[CYCLE_COUNT];
						raw[CYCLE_COUNT] = dc;
						for (;;) {
							rawrun();
							if (halting_solution === "outofgas") break;
						}
						raw[CYCLE_COUNT] = tmp-dc;
					}
				}

				function goto_brk(d) {
					if (d > 0) {
						while (d > 0) {
							rawrun();
							if (halting_solution === "brk") d--;
						}
					} else if (d < 0) {
						const c0 = raw[CYCLE_COUNT];
						restore_snapshot(snapshot0);
						let brks = [];
						while (raw[CYCLE_COUNT] > c0) {
							rawrun();
							if (halting_solution === "brk") {
								brks.push(raw[CYCLE_COUNT]);
							}
						}
						const cbrk = brks[brks.length - 1 + d];
						restore_snapshot(snapshot0);
						for (;;) {
							rawrun();
							if (raw[CYCLE_COUNT] === cbrk) break;
						}
					}
				}

				function goto_pass(d) {
					const usrbrk = [raw[PC0], raw[PC1]];
					if (d > 0) {
						while (d > 0) {
							for (;;) {
								single_step(1); // skip past usrbrk
								rawrun(usrbrk);
								if (halting_solution === "usrbrk") {
									d--;
									break;
								}
							}
						}
					} else if (d < 0) {
						// FIXME this is broken...
						const c0 = raw[CYCLE_COUNT];
						restore_snapshot(snapshot0);
						let usrbrks = [];
						while (raw[CYCLE_COUNT] > c0) {
							single_step(1);
							rawrun(usrbrk);
							if (halting_solution === "usrbrk") {
								usrbrks.push(raw[CYCLE_COUNT]);
								break;
							}
						}
						const cbrk = usrbrks[usrbrks.length - 1 + d];
						restore_snapshot(snapshot0);
						for (;;) {
							single_step(1);
							rawrun(usrbrk);
							if (raw[CYCLE_COUNT] === cbrk) break;
						}
					}
				}

				const get_stack  = () => raw[STACK];
				const get_rstack = () => raw[RSTACK];

				function set_dump_callback(fn) {
					dump_callback_fn = fn;
				}

				self = {
					get_raw: () => raw,
					get_vm_words: () => vm_words,
					can_run,
					get_cycle_counter,
					set_cycle_counter,
					get_stack,
					get_rstack,
					did_exit: () => raw[PC0] < 0,
					did_throw: () => !!last_exception,
					get_exception: () => last_exception,
					get_position,
					get_position_human: () => {
						const pos = get_position();
						if (!pos) return "???";
						return pos[0] + ":" + (1+pos[1]) + ":" + (1+pos[2]);
					},
					set_pc_to_export_word_index: (i) => {
						const j = export_word_indices[i];
						if (j === undefined) throw new Error("bad index: " + i);
						raw[PC0] = j;
						raw[PC1] = -1;
					},
					set_dump_callback,

					get_tagged_stack,
					get_tagged_globals,
					save_snapshot,
					restore_snapshot,

					run,
					single_step,
					goto_brk,
					goto_pass,
				};
				return self;
			}

			function new_state() {
				return bless([
					-1, 0,
					[], [], [],
					1,
					new WeakMap(),
				])
			}

			function resolve_breakpoint(filename, line, col) {
				let best_span_index = null;
				let best_span_size = null;
				for (let i = 0; i < vm_word_spans.length; i++) {
					const [ p0, p1 ] = vm_word_spans[i];
					if (p0[0] !== filename || p1[0] !== filename) continue;
					if (!span_contains(p0[1], p0[2], p1[1], p1[2], line, col)) continue;
					const span_size = [p1[1]-p0[1], p1[2]-p0[2]];
					if (best_span_size === null || span_size[0] < best_span_size[0] || (span_size[0] === best_span_size[0] && span_size[1] < best_span_size[1])) {
						best_span_index = i;
						best_span_size = span_size;
					}
				}
				if (best_span_index === null) return null;

				function is_better_distance(best,challenge) {
					return (best === null) || (challenge[0] < best[0] || (challenge[0] === best[0] && challenge[1] < best[1]));
				}

				let best_position = null;
				const positions = dbg_words[best_span_index];
				const n1 = positions.length;
				for (let i = 0; i < n1; i++) {
					const pos = positions[i];
					if (pos[0] !== filename) continue;
					best_position = [best_span_index, i];
					if (pos[1] > line || (pos[1] === line && pos[2] >= col)) break;
					best_position = [best_span_index, i+1];
				}
				return best_position;
			}

			return {
				raw_vm: vm,
				new_state,
				vm_words,
				dbg_words,
				vm_word_spans,
				export_word_indices,
				export_word_names,
				vm_src,
				resolve_breakpoint,
			};
		}

		return {
			trace_program_debug:   match_word_path_fn => trace_program(match_word_path_fn, true),
			trace_program_release: match_word_path_fn => trace_program(match_word_path_fn, false),
		};
	}

	return {
		keyword_set,
		tokenize_line,
		tokenize_lines,
		tokenize_string,
		tokenize_file,
		preprocess_from_entry_file,
		compile,
		compile_debug:   f=>compile(f,false),
		compile_release: f=>compile(f,true),
		is_test_word,
		is_main_word,
		find_word_path,
	};
}

if (typeof module !== 'undefined' && module.exports) module.exports = new_compiler;
