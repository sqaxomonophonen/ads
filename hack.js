
window.onload = () => {
	const IS_OFFLINE = window.location.href.split(":")[0] === "file";

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
		lines: [],
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
			for (const line of lines) {
				const tokens = compiler.tokenize_line(line);

				let hl = "<div>";

				const add_ws = (n) => {
					let ws = "";
					while (ws.length < n) ws += " ";
					hl += "<span class=\"syn-ws\">"+ws+"</span>";
				};

				let cur = 0;
				for (const [ pos, typ ] of tokens) {
					const [ c0, c1 ] = pos.slice(2);
					if (c0 > cur) {
						add_ws(c0-cur);
						cur = c0;
					}
					hl += "<span class=\"syn-" + typ + "\">" + escape_html(line.slice(c0, c1)) + "</span>";
					cur = c1;
				}

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

		const toplvl_keys = {"Escape":true};

		const no_modifiers = (ev) => !ev.ctrlKey && !ev.metaKey; // probably a bad idea to add shiftKey/altKey?

		ed.addEventListener('keydown', (ev) => {
			const c = ev.code;
			if (!toplvl_keys[c]) {
				const b = keybind_table[c];
				if (no_modifiers(ev) && b) {
					b();
					refresh();
					ed.focus();
					ev.preventDefault();
				}
			}
		});

		window.addEventListener("keydown", (ev) => {
			const c = ev.code;
			if (toplvl_keys[c]) {
				const b = keybind_table[c];
				if (no_modifiers(ev) && b) {
					b();
					refresh();
					ed.focus();
					ev.preventDefault();
				}
			}
		});

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
		function end(ev) {
			is_resizing = false;
			body.removeEventListener('mouseup', end);
			body.removeEventListener('mousemove', move);
			ev.preventDefault();
		}
		function move(ev) {
			if (is_resizing) {
				pane_left.style.flexBasis = ev.clientX + "px";
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
