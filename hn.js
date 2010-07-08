/*
Copyright 2010, Russell Haering <russellhaering@gmail.com>. All rights
reserved.  Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including without
limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom
the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
 */

var http = require('http');
var htmlparser = require("./lib/node-htmlparser/node-htmlparser");
var url = require('url');

var routes = {
    '/':        getNews,
    '/newest':  getNewest,
    '/best':    getBest,
    '/item':    getItem,
};

function getNews(req, res) {
    getList(req, res, '/');
};

function getNewest(req, res) {
    getList(req, res, '/newest');
};

function getBest(req, res) {
    getList(req, res, '/best');
}

function getItem(req, res) {
    var id = url.parse(req.url, true)['query']['id'];
    var hn = http.createClient(80, "news.ycombinator.com");
    var request = hn.request("GET", "/item?id=" + id, {
        'host': 'news.ycombinator.com',
    });
    request.end();
    request.addListener("response", function(response) {
        var body = "";
        var handler = new htmlparser.DefaultHandler(function (error, dom) {
            // Grab the table that contains the list of articles
            var header =   dom[0]['children'][1]['children'][0]['children'][0]['children'][2]['children'][0]['children'][0]['children'];
            var comments = dom[0]['children'][1]['children'][0]['children'][0]['children'][2]['children'][0]['children'][3]['children'];

            var here = comments[0]['children'][0]['children'][0]['children'][0]['children'][2]['children'][2];

            var article = {
                'id':           header[1]['children'][1]['children'][4]['attribs']['href'].split('=')[1],
                'headline':     header[0]['children'][1]['children'][0]['children'][0]['data'],
                'url':          header[0]['children'][1]['children'][0]['attribs']['href'],
                'score':        header[1]['children'][1]['children'][0]['children'][0]['data'].split(' ')[0],
                'submitter':    header[1]['children'][1]['children'][2]['attribs']['href'].split('=')[1],
                'comments':     header[1]['children'][1]['children'][4]['children'][0]['data'].split(' ')[0],
                'age':          header[1]['children'][1]['children'][3]['data'].split(' |')[0].replace(/^\s*|\s*$/g, ""),
                'children':     [],
            };

            for (var i = 0; i < comments.length; i++) {
                var comment = {
                    'depth':    parseInt(comments[i]['children'][0]['children'][0]['children'][0]['children'][0]['children'][0]['attribs']['width'])/40,
                    'html':     toHTML(comments[i]['children'][0]['children'][0]['children'][0]['children'][2]['children'][2]),
                };
                article['children'][i] = comment;
            }

            var text = JSON.stringify(article);
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': text.length,
            });
            res.end(text);
        }, { ignoreWhitespace: true});
        var parser = new htmlparser.Parser(handler);

        response.setEncoding("utf8");
        response.addListener("data", function(chunk) {
            parser.parseChunk(chunk);
        });

        response.addListener("end", function() {
            parser.done();
        });
    });
};

function getList(req, res, path) {
    var hn = http.createClient(80, "news.ycombinator.com");
    var request = hn.request("GET", path, {
        'host': 'news.ycombinator.com',
    });
    request.end();
    request.addListener("response", function(response) {
        var body = "";
        var handler = new htmlparser.DefaultHandler(function (error, dom) {
            // Grab the table that contains the list of articles
            var rows = dom[0]['children'][1]['children'][0]['children'][0]['children'][2]['children'][0]['children'][0]['children'];
            var data = [];

            // Each article takes 3 rows, and the last two rows aren't affiliated with articles
            for (var i = 0; i < (rows.length - 2)/3; i++) {
                // Parse out various article details
                var article = {
                    'id':           rows[i*3 + 1]['children'][1]['children'][4]['attribs']['href'].split('=')[1],
                    'headline':     rows[i*3]['children'][2]['children'][0]['children'][0]['data'],
                    'url':          rows[i*3]['children'][2]['children'][0]['attribs']['href'],
                    'score':        rows[i*3 + 1]['children'][1]['children'][0]['children'][0]['data'].split(' ')[0],
                    'submitter':    rows[i*3 + 1]['children'][1]['children'][2]['attribs']['href'].split('=')[1],
                    'comments':     rows[i*3 + 1]['children'][1]['children'][4]['children'][0]['data'].split(' ')[0],
                    'age':          rows[i*3 + 1]['children'][1]['children'][3]['data'].split(' |')[0].replace(/^\s*|\s*$/g, ""),
                };

                if (article['comments'] == 'discuss') {
                    article['comments'] = '0';
                }

                data[i] = article;
            }

            // Return a list of JSON articles
            var text = JSON.stringify(data);
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': text.length,
            });
            res.end(text);
        });
        var parser = new htmlparser.Parser(handler);

        response.setEncoding("utf8");
        response.addListener("data", function(chunk) {
            parser.parseChunk(chunk);
        });

        response.addListener("end", function() {
            parser.done();
        });
    });
};

http.createServer(function (req, res) {
    var pathname = url.parse(req.url)['pathname'];
    var method = routes[pathname];
    if (method != undefined) {
        method(req, res);
    }
}).listen(8124, "127.0.0.1");


// Sort of a ghetto way to turn a comment back into HTML
function toHTML(node) {
    var HTML = "";
    if (node['type'] == 'tag') {
        HTML += "<" + node['raw'] + ">";
        if (node['children'] != undefined) {
            for (var i = 0; i < node['children'].length; i++) {
                HTML += toHTML(node['children'][i]);
            }
        }
        if (node['name'] != 'p') {
            HTML += "</" + node['name'] + ">";
        }
    }
    else if (node['type'] == 'text') {
        HTML += node['raw'];
    }
    return HTML;
}
