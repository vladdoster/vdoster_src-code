var BUCKET_URL = 'https://files.vdoster.com.s3.amazonaws.com'
var EXCLUDE_FILE = ['index.html'] // array of file names that shouldnt be displayed
var S3BL_IGNORE_PATH = true
var S3B_ROOT_DIR = ''
var BUCKET_WEBSITE_URL
var S3B_SORT
if (typeof S3BL_IGNORE_PATH === 'undefined' || S3BL_IGNORE_PATH !== true) {
  S3BL_IGNORE_PATH = false
}
if (typeof BUCKET_WEBSITE_URL === 'undefined') {
  // append a ending slash
  BUCKET_WEBSITE_URL = BUCKET_URL + '/'
}
if (typeof S3B_ROOT_DIR === 'undefined') {
  S3B_ROOT_DIR = ''
}
if (typeof S3B_SORT === 'undefined') {
  S3B_SORT = 'DEFAULT'
}
if (typeof EXCLUDE_FILE === 'undefined') {
  EXCLUDE_FILE = []
} else if (typeof EXCLUDE_FILE === 'string') {
  EXCLUDE_FILE = [EXCLUDE_FILE]
}
// https://tc39.github.io/ecma262/#sec-array.prototype.includes
if (!Array.prototype.includes) {
  Object.defineProperty(Array, 'includes', {
    value: function (searchElement, fromIndex) {
      if (this == null) {
        throw new TypeError('"this" is null or not defined')
      }
      // 1. Let O be ? ToObject(this value).
      var o = Object(this)
      // 2. Let len be ? ToLength(? Get(O, "length")).
      var len = o.length >>> 0
      if (len === 0) {
        return false
      }
      // 4. Let n be ? ToInteger(fromIndex).
      //    (If fromIndex is undefined, this step produces the value 0.)
      var n = fromIndex | 0
      // 5. If n Ã¢â€°Â¥ 0, then
      //  a. Let k be n.
      // 6. Else n < 0,
      //  a. Let k be len + n.
      //  b. If k < 0, let k be 0.
      var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0)

      function sameValueZero (x, y) {
        return (
          x === y ||
          (typeof x === 'number' &&
            typeof y === 'number' &&
            isNaN(x) &&
            isNaN(y))
        )
      }
      // 7. Repeat, while k < len
      while (k < len) {
        //  a. Let elementK be the result of ? Get(O, ! ToString(k)).
        //  b. If SameValueZero(searchElement, elementK) is true, return true.
        if (sameValueZero(o[k], searchElement)) {
          return true
        }
        //  c. Increase k by 1.
        k++
      }
      // 8. Return false
      return false
    }
  })
}
jQuery(function ($) {
  getS3Data()
})
// This will sort your file listing by most recently modified.
// Flip the comparator to '>' if you want oldest files first.
function sortFunction (a, b) {
  switch (S3B_SORT) {
    case 'OLD2NEW':
      return a.LastModified > b.LastModified ? 1 : -1
    case 'NEW2OLD':
      return a.LastModified < b.LastModified ? 1 : -1
    case 'A2Z':
      return a.Key < b.Key ? 1 : -1
    case 'Z2A':
      return a.Key > b.Key ? 1 : -1
    case 'BIG2SMALL':
      return a.Size < b.Size ? 1 : -1
    case 'SMALL2BIG':
      return a.Size > b.Size ? 1 : -1
  }
}

function getS3Data (marker, html) {
  var S3RestUrl = createS3QueryUrl(marker)
  // set loading notice
  $('#listing').html(
    '<img src="http://files.vdoster.com.s3.amazonaws.com/src/loading.gif" />'
  )
  $.get(S3RestUrl)
    .done(function (data) {
      // clear loading notice
      $('#listing').html('')
      var xml = $(data)
      var info = getInfoFromS3Data(xml)
      // Slight modification by FuzzBall03
      // This will sort your file listing based on var S3B_SORT
      // See url for example:
      // http://esp-link.s3-website-us-east-1.amazonaws.com/
      if (S3B_SORT !== 'DEFAULT') {
        var sortedFiles = info.files
        sortedFiles.sort(sortFunction)
        info.files = sortedFiles
      }
      buildNavigation(info)
      // Add a <base> element to the document head to make relative links
      // work even if the URI does not contain a trailing slash
      var base = window.location.href
      base = base.endsWith('/') ? base : base + '/'
      $('head').append('<base href="' + base + '">')
      html =
        typeof html !== 'undefined'
          ? html + prepareTable(info)
          : prepareTable(info)
      if (info.nextMarker !== 'null') {
        getS3Data(info.nextMarker, html)
      } else {
        document.getElementById('listing').innerHTML = '<pre>' + html + '</pre>'
      }
    })
    .fail(function (error) {
      console.error(error)
      $('#listing').html('<strong>Error: ' + error + '</strong>')
    })
}

function buildNavigation (info) {
  // This is topmost line on file server
  var root = '<a href="?prefix="><b>Files</b></a> | cwd â†’ /'
  if (info.prefix) {
    var processedPathSegments = ''
    var content = $.map(info.prefix.split('/'), function (pathSegment) {
      processedPathSegments =
        processedPathSegments + encodeURIComponent(pathSegment) + '/'
      return (
        '<a href="?prefix=' +
        processedPathSegments +
        '">' +
        pathSegment +
        '</a>'
      )
    })
    $('#navigation').html(root + content.join('/'))
  } else {
    $('#navigation').html(root)
  }
}

function createS3QueryUrl (marker) {
  var S3RestUrl = BUCKET_URL += '?delimiter=/'
  var rx = '.*[?&]prefix=' + S3B_ROOT_DIR + '([^&]+)(&.*)?$'
  var prefix = ''
  if (S3BL_IGNORE_PATH === false) {
    prefix = location.pathname.replace(/^\//, S3B_ROOT_DIR)
  }
  var match = location.search.match(rx)
  if (match) {
    prefix = S3B_ROOT_DIR + match[1]
  } else {
    if (S3BL_IGNORE_PATH) {
      prefix = S3B_ROOT_DIR
    }
  }
  if (prefix) {
    // make sure we end in /
    prefix = prefix.replace(/\/$/, '') + '/'
    S3RestUrl += '&prefix=' + prefix
  }
  if (marker) {
    S3RestUrl += '&marker=' + marker
  }
  return S3RestUrl
}

function getInfoFromS3Data (xml) {
  var files = $.map(xml.find('Contents'), function (item) {
    item = $(item)
    return {
      Key: item.find('Key').text(),
      LastModified: item.find('LastModified').text(),
      Size: bytesToHumanReadable(item.find('Size').text()),
      Type: 'file'
    }
  })
  var directories = $.map(xml.find('CommonPrefixes'), function (item) {
    item = $(item)
    return {
      Key: item.find('Prefix').text(),
      LastModified: '',
      Size: '0',
      Type: 'directory'
    }
  })
  if ($(xml.find('IsTruncated')[0]).text() === 'true') {
    var nextMarker = $(xml.find('NextMarker')[0]).text()
  } else {
    nextMarker = null
  }
  return {
    files: files,
    directories: directories,
    prefix: $(xml.find('Prefix')[0]).text(),
    nextMarker: encodeURIComponent(nextMarker)
  }
}

function prepareTable (info) {
  var files = info.directories.concat(info.files)
  var prefix = info.prefix
  var cols = [45, 30, 15]
  var content = []
  content.push(
    padRight('Last Modified', cols[1]) +
      '  ' +
      padRight('Size', cols[2]) +
      'Name \n'
  )
  content.push(new Array(cols[0] + cols[1] + cols[2] + 4).join('-') + '\n')
  // add ../ at the start of the dir listing, unless we are already at root dir
  if (prefix && prefix !== S3B_ROOT_DIR) {
    var up = prefix
      .replace(/\/$/, '')
      .split('/')
      .slice(0, -1)
      .concat('')
      .join('/') // one directory up
    var item = {
      Key: up,
      LastModified: '',
      Size: '',
      keyText: '../',
      href: S3BL_IGNORE_PATH ? '?prefix=' + up : '../'
    }
    var row = renderRow(item, cols)
    content.push(row + '\n')
  }
  jQuery.each(files, function (idx, item) {
    item.keyText = item.Key.substring(prefix.length)
    if (item.Type === 'directory') {
      if (S3BL_IGNORE_PATH) {
        item.href =
          location.protocol +
          '//' +
          location.hostname +
          location.pathname +
          '?prefix=' +
          encodePath(item.Key)
      } else {
        item.href = encodePath(item.keyText)
      }
    } else {
      item.href = BUCKET_WEBSITE_URL + encodePath(item.Key)
    }
    var row = renderRow(item, cols)
    if (!EXCLUDE_FILE.includes(item.Key)) content.push(row + '\n')
  })
  return content.join('')
}
// Encode everything but "/" which are significant in paths and to S3
function encodePath (path) {
  return encodeURIComponent(path).replace(/%2F/g, '/')
}

function renderRow (item, cols) {
  var row = ''
  row += padRight(item.LastModified, cols[1]) + '  '
  row += padRight(item.Size, cols[2])
  row += '<a href="' + item.href + '">' + item.keyText + '</a>'
  return row
}

function padRight (padString, length) {
  var str = padString.slice(0, length - 3)
  if (padString.length > str.length) {
    str += '...'
  }
  while (str.length < length) {
    str = str + ' '
  }
  return str
}

function bytesToHumanReadable (sizeInBytes) {
  var i = -1
  var units = [' kB', ' MB', ' GB']
  do {
    sizeInBytes = sizeInBytes / 1024
    i++
  } while (sizeInBytes > 1024)
  return Math.max(sizeInBytes, 0.1).toFixed(1) + units[i]
}