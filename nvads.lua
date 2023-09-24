uv = require("luv")

local ADS_initialized = false

function ADS_initialize()
	if ADS_initialized then
		return
	end
	ADS_initialized = true

	local function get_pos()
		local cursor = vim.api.nvim_win_get_cursor(0)
		return { line=cursor[1], column=cursor[2], uri="file://" .. vim.fn.expand('%:p') }
	end

	local oldpos = nil
	local timer = uv.new_timer()
	timer:start(1000, 20, vim.schedule_wrap(function()
		local pos = get_pos()
		if oldpos == nil or pos.line ~= oldpos.line or pos.column ~= old_pos.column or pos.uri ~= old_pos.uri then
			old_pos = pos
			vim.lsp.buf.execute_command({
				command="position",
				arguments=pos
			})
		end
	end))

	vim.keymap.set('n', 'K', function()
		vim.lsp.buf.execute_command({command="entrypoint",arguments=get_pos()})
	end)


	local function goto_hack(what, direction)
		vim.lsp.buf.execute_command({
			command="prepare_goto_hack",
			arguments={
				what=what,
				direction=direction,
			},
		})
		-- LSP has 4 "gotos"; goto declaration / definition / type
		-- definition / implementation ... but I need a couple more, so
		-- "type definition" is the "umbrella goto" when preceeded by a
		-- "prepare_goto_hack" command
		vim.lsp.buf.type_definition()
	end

	local function dpass(delta)
		vim.lsp.buf.execute_command({command="passes",arguments={delta=delta}})
	end

	local function max_iterations_scale(scalar)
		vim.lsp.buf.execute_command({command="max_iterations_scale",arguments={scalar=scalar}})
	end

	--[[
	BAD CTRL KEYS:
	 <C-a>  GNU Screen escape
	 <C-v>  Vim visual block mode
	]]
	vim.keymap.set('n', '<C-q>', vim.lsp.buf.implementation)
	vim.keymap.set('n', '<C-w>', function() dpass( 1) end)
	vim.keymap.set('n', '<C-s>', function() dpass(-1) end)
	vim.keymap.set('n', '<C-e>', function() goto_hack("step",        1) end)
	vim.keymap.set('n', '<C-d>', function() goto_hack("step",       -1) end)
	vim.keymap.set('n', '<C-r>', function() goto_hack("callstack",   1) end)
	vim.keymap.set('n', '<C-f>', function() goto_hack("callstack",  -1) end)
	vim.keymap.set('n', '<C-t>', function() goto_hack("brk",         1) end)
	vim.keymap.set('n', '<C-g>', function() goto_hack("brk",        -1) end)
	vim.keymap.set('n', '<C-y>', function() print("A+") end)
	vim.keymap.set('n', '<C-h>', function() print("A-") end)
	vim.keymap.set('n', '<C-u>', function() max_iterations_scale(2) end)
	vim.keymap.set('n', '<C-j>', function() max_iterations_scale(0.5) end)

end

function ADS()
	ADS_initialize()
	vim.lsp.start({
		name = 'hack4st',
		cmd      = ADS_CMD,
		root_dir = ADS_ROOT_DIR,
	})
end

vim.cmd(":command! ADS :lua ADS()")

vim.filetype.add({
	extension = {
		["4st"] = "4st"
	}
})
