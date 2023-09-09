uv = require("luv")
function ADS()
	vim.lsp.start({
		name = 'hack4st',
		cmd = ADS_CMD,
		root_dir = ADS_ROOT_DIR,
	})

	local uri = nil
	local line = 0
	local column = 0
	local timer = uv.new_timer()
	timer:start(1000, 50, vim.schedule_wrap(function()
		local cursor = vim.api.nvim_win_get_cursor(0)
		local new_uri = "file://" .. vim.fn.expand('%:p')
		if cursor[1] ~= line or cursor[2] ~= column or new_uri ~= uri then
			line = cursor[1]
			column = cursor[2]
			uri = new_uri
			vim.lsp.buf.execute_command({
				command="position",
				arguments={
					line=line,
					column=column,
					uri=uri,
				}
			})
		end
	end))
end
vim.cmd(":command! ADS :lua ADS()")
