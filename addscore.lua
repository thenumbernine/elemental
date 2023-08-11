require 'ext'
local json = require 'dkjson'
local wsapi_request = require 'wsapi.request'

return {
	run = function(env)
		local headers = { 
			["Content-type"] = "text/javascript",
			["Cache-Control"] = "no-cache",
		}
		local headers = { ["Content-type"] = "text/javascript" }
		local req = wsapi_request.new(env)
		local score = req.GET and req.GET.score
		local name = req.GET and req.GET.name
		local level = req.GET and req.GET.level

		-- TODO send move lists and verify results 
		local scores = assert(json.decode(io.readfile('scores.json')), 'failed to parse file')
		table.insert(scores, {name=name, level=level, score=score})
		table.sort(scores, function(a,b)
			return (tonumber(a.score) or 0) > (tonumber(b.score) or 0)
		end)
		io.writefile('scores.json', json.encode(scores, {indent=true}))

		local function text() end
		return 200, headers, coroutine.wrap(text)
	end
}
