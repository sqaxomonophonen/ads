
window.onload = () => {
	const IS_OFFLINE = window.location.href.split(":")[0] === "file";

	const clamp = (x,min,max) => Math.max(min, Math.min(max, x));

	const prefs = (() => {
		const KEY = "hack137_prefs";
		const get_obj = _ => JSON.parse(window.localStorage.getItem(KEY) || "{}");
		const get = key => get_obj()[key];
		function set(key, value) {
			let o = get_obj();
			o[key] = value;
			window.localStorage.setItem(KEY, JSON.stringify(o));
		}
		return { get, set };
	})();

	const CC = s=>s.charCodeAt(0);
	const $ = s => {
		const [ c0, c1 ] = [ s[0], s.slice(-1) ];
		return  c0 === "#"               ? document.getElementById(s.slice(1))            :
		        c0 === "."               ? document.getElementsByClassName(s.slice(1))    :
		        c0 === "<" && c1 === ">" ? document.createElement(s.slice(1,s.length-1))  :
		                                   document.getElementByTagName(s);
	};

	const UNREACHABLE = m => { throw new Error("UNREACHABLE/"+m) };

	const escape_html = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

	const fs = (() => {
		let store = {};
		return {
			set_store: (new_store) => { store = new_store; },
			read_file: (filename) => store[filename],
		};
	})();
	const compiler = new_compiler(fs.read_file);

	function class_set(em) {
		let classes = (em.getAttribute("class")||"").split(" ").filter(x => x.length);
		let refresh = () => em.setAttribute("class", classes.join(" " ));
		let has = c => classes.filter(x=>x===c).length > 0;
		let add = c => {
			if (has(c)) return;
			classes.push(c);
			refresh();
		};
		let remove = c => {
			if (!has(c)) return;
			classes = classes.filter(x => x !== c);
			refresh();
		};
		return { classes, has, add, remove };
	}

	const class_args = (args) => [class_set(args[0]), [...args].slice(1)];

	function add_class() {
		const [ set, classes ] = class_args(arguments);
		for (const c of classes) set.add(c);
	}

	function remove_class() {
		const [ set, classes ] = class_args(arguments);
		for (const c of classes) set.remove(c);
	}

	const ed = $("#ed");

	let prg;

	let hvim_mode = 0;
	const COMMAND="COMMAND", EDIT="EDIT", ANNOTATION="ANNOTATION",
	WORD="WORD", LINE="LINE"
	;
	let hvim = {
		mmode: COMMAND,
		tmode: WORD,
	};

	let keybind_table = {};
	function install_keybinds(keybinds) {
		keybind_table = {};
		const kbs = $("#keybinds");
		kbs.innerHTML = "";
		const ARROWS="&larr;&uarr;&rarr;&darr;";
		for (let i = 0; i < keybinds.length; i++) {
			const keybind = keybinds[i];
			const [ sig, fn, title ] =
				keybind === "CARET0" ? [     "["+ARROWS+"] move-caret", null, "Move caret around" ] :
				keybind === "CARET1" ? [ "[hjkl"+ARROWS+"] move-caret", null, "Move caret around" ] :
				keybind === "NUM"    ? [                     "[0-9] #", null, "Repeat N times"    ] :
				keybind;
			const i0 = sig.indexOf("[");
			const i1 = sig.indexOf("]");
			const do_join = sig[i1+1] !== " ";
			const before = sig.slice(0,i0).trim();
			const keydef = sig.slice(i0+1,i1).trim();
			const after = sig.slice(i1+1).trim();
			if (fn) {
				for (let k of keydef.split("/")) {
					let c = undefined;
					if (k.toLowerCase() === "esc") {
						c = "Escape";
					} else if (k === ",") {
						c = "Comma";
					} else if (k.length === 1 && (CC("A") <= CC(k.toUpperCase()) && CC(k.toUpperCase()) <= CC("Z"))) {
						c = "Key" + k.toUpperCase();
					}
					if (c === undefined) throw new Error("error in keydef: " + keydef);
					keybind_table[c] = fn;
				}
			}
			const kb = $("<keybind>");

			const push_span = (txt) => {
				if (txt.length === 0) return;
				const e = $("<span>");
				e.innerHTML = txt;
				kb.appendChild(e);
			};

			if (i > 0) kbs.appendChild(document.createTextNode(" "));

			push_span(before);

			{
				const e = $("<key>");
				e.setAttribute("class", do_join ? "keyjoin" : "keyspace");
				e.innerHTML = keydef;
				kb.appendChild(e);
			}

			push_span(after);

			if (title) kb.setAttribute("title", title);
			kbs.appendChild(kb);
		}
	}

	let caret_range = [[0,0],[0,0]];

	function get_caret_position(start) {
		const selection = window.getSelection();
		if (selection.rangeCount < 1) return [0,0];
		const range = selection.getRangeAt(0);
		const c0 = (start ? range.startContainer : range.endContainer);
		let span = c0.parentNode;
		if (span.tagName !== "SPAN") {
			if (c0.tagName === "SPAN") {
				span = c0;
			} else {
				return [0,0];
			}
		}
		const p0 = span.getAttribute("data-p0");
		if (!p0) return [0,0];
		const [ line, col0 ] = p0.split(",").map(x=>parseInt(x,10))
		const column = col0 + (start ? range.startOffset : range.endOffset);
		return [line, Math.max(0,column)];
	}

	function light_refresh() {
		caret_range = [get_caret_position(true), get_caret_position(false)];

		const fmt_caret = (pos) => (1+pos[0]) + "," + (1+pos[1]);
		if (caret_range[0][0] !== caret_range[1][0] || caret_range[0][1] !== caret_range[1][1]) {
			$("#ed_info").innerHTML = fmt_caret(caret_range[0])+"-"+fmt_caret(caret_range[1]);
		} else {
			$("#ed_info").innerHTML = fmt_caret(caret_range[0]);
		}
	}

	function refresh() {
		const root = $("#ed_root");
		const mode = $("#ed_mode");

		{
			const common_stuff = [
				[ COMMAND    , "ed_border_cmd"        , "COMMAND"    , "Command Mode (keys execute commands; see keybinds)" ],
				[ EDIT       , "ed_border_edit"       , "EDIT"       , "Edit Mode (functions like a normal text editor"     ],
				[ ANNOTATION , "ed_border_annotation" , "ANNOTATION" , "Annotation Mode (let keybinds guide you)"           ],
			];
			for (const [id,cls,label,title] of common_stuff) {
				if (hvim.mmode === id) {
					mode.innerHTML = label;
					mode.setAttribute("title", title);
					add_class(root, cls);
				} else {
					remove_class(root, cls);
				}
			}
		}

		light_refresh();

		if (hvim.mmode === COMMAND) {
			ed.setAttribute("contenteditable", "false");
			install_keybinds([
				[ "[Esc/i]nsert"  , _ => { hvim.mmode = EDIT; } ,   "Enter insert mode at beginning of word" ],
				[ "[e]nd-insert"  , _ => { hvim.mmode = EDIT; } ,   "Enter insert mode at end of word" ],
				[ "[a]ppend"      , _ => { hvim.mmode = EDIT; } ,   "Enter insert mode at beginning of next word" ],

				hvim.tmode === WORD ? [ "[q] line-mode",   _ => { hvim.tmode = LINE; }, "Enter insert mode at beginning of next word" ] :
				hvim.tmode === LINE ? [ "[q] word-mode",   _ => { hvim.tmode = WORD; }, "Enter insert mode at beginning of next word" ] :
				UNREACHABLE(),

				"NUM",

				hvim.tmode === WORD ? [ "[c]hange-word",   _ => {}, "" ] :
				hvim.tmode === LINE ? [ "[c]hange-line",   _ => {}, "" ] :
				UNREACHABLE(),

				hvim.tmode === WORD ? [ "[d]elete-word",   _ => {}, "" ] :
				hvim.tmode === LINE ? [ "[d]elete-line",   _ => {}, "" ] :
				UNREACHABLE(),

				hvim.tmode === WORD ? [ "[y]ank-word",   _ => {}, "" ] :
				hvim.tmode === LINE ? [ "[y]ank-line",   _ => {}, "" ] :
				UNREACHABLE(),

				[ "[p]aste"              , _ => {} ,   "Paste yank buffer" ],

				[ "[,] annotation-mode"  , _ => { hvim.mmode = ANNOTATION; } ,  "Interactive stack mutation annotation (doesn't bite!)" ],

				[ "[u]ndo"               , _ => {} ,   "Undo changes" ],
				[ "[r]edo"               , _ => {} ,   "Redo changes" ],

				"CARET1",
			]);
		} else if (hvim.mmode === EDIT) {
			ed.setAttribute("contenteditable", "true");
			install_keybinds([
				[ "[Esc] command-mode",    _ => { hvim.mmode = COMMAND; }, "Go back to Command Mode" ],
				"CARET0",
			]);
		} else if (hvim.mmode === ANNOTATION) {
			ed.setAttribute("contenteditable", "false");
			install_keybinds([
				[ "[Esc] abort"   , _ => { hvim.mmode = COMMAND; } ,   "Abort annotation; go back to Command Mode" ],
			]);
		} else {
			throw new Error("unhandled mode");
		}
		mode.style.color = getComputedStyle(root).borderColor;
	}

	function init_editor() {
		const sel = $("#ed_select_file");
		let edit_files = [];
		for (let [ name, code ] of prg.files) {
			if (!name.endsWith(".4st")) continue;
			edit_files.push([name, code]);
			const opt = $("<option>");
			opt.innerHTML = name;
			sel.appendChild(opt);
		}

		function select_index(i) {
			const code = edit_files[i][1];
			const lines = code.split("\n");
			const html_lines = [];
			for (let line_number = 0; line_number < lines.length; line_number++) {
				const line = lines[line_number];
				const tokens = compiler.tokenize_line(line);

				let hl = "<div>";

				let column = 0;

				function push_span(typ, body) {
					hl += "<span data-p0=\""+line_number+","+column+"\" class=\"syn-"+typ+"\">"+escape_html(body)+"</span>";
					column += body.length;
				};

				function add_ws(n) {
					let ws = "";
					while (ws.length < n) ws += " ";
					push_span("whitespace", ws);
				};

				let cur = 0;
				for (const [ pos, typ ] of tokens) {
					const [ c0, c1 ] = pos.slice(2);
					if (c0 > cur) {
						add_ws(c0-cur);
						cur = c0;
					}
					push_span(typ, line.slice(c0, c1));
					cur = c1;
				}

				if (line.length === 0) hl += "<span data-p0=\""+line_number+",-1\"><br/></span>";

				hl += "</div>";
				html_lines.push(hl);
			}
			ed.innerHTML = html_lines.join("");
		}

		sel.addEventListener("change", (ev) => {
			select_index(ev.target.selectedIndex);
		});
		select_index(0);

		ed.focus();

		const toplvl_keys = {"Escape":1};
		const no_modifiers = (ev) => !ev.ctrlKey && !ev.metaKey; // probably a bad idea to add shiftKey/altKey?
		function on_keydown(is_toplvl, ev) {
			const c = ev.code;
			if (is_toplvl === !!toplvl_keys[c]) {
				const handler = keybind_table[c];
				if (handler && no_modifiers(ev)) {
					handler();
					refresh();
					ed.focus();
					ev.preventDefault();
				}
			}
		}
		ed.addEventListener('keydown', (ev) => on_keydown(false, ev));
		ed.addEventListener('keyup', (ev) => {
			light_refresh();
		});
		window.addEventListener("keydown", (ev) => on_keydown(true, ev));

		refresh();
	}

	if (IS_OFFLINE) {
		prg = {
			files: [
				[ "offline.4st", " ( offline.4st )\n" ]
			]
		};
		init_editor();
	} else {
		fetch("prg").then(r => r.json().then(r => {
			prg = r;
			init_editor();
		}));
	}

	{ // install pane resizing
		let is_resizing = false;
		const pane_resize = $("#pane_resize");
		const pane_left = $("#pane_left");
		const body = document.body;

		let pane_pct = prefs.get("pane_pct");
		if (typeof pane_pct !== "number") pane_pct = 38;
		pane_pct = clamp(pane_pct, 5, 95);
		pane_left.style.flexBasis = pane_pct+"%";

		function end(ev) {
			is_resizing = false;
			body.removeEventListener('mouseup', end);
			body.removeEventListener('mousemove', move);
			ev.preventDefault();
		}
		function move(ev) {
			if (is_resizing) {
				pane_left.style.flexBasis = ev.clientX + "px";
				prefs.set("pane_pct", Math.round(ev.clientX*100/window.innerWidth));
				ev.preventDefault();
			} else {
				end(ev);
			}
		}
		pane_resize.addEventListener("mousedown", (ev) => {
			is_resizing = true;
			body.addEventListener('mousemove', move);
			body.addEventListener('mouseup', end);
			ev.preventDefault();
		});
	}
};
