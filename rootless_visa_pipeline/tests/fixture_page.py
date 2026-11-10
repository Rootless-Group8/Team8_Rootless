"""
A synthetic fixture mimicking the real structure of a Wikipedia
"Visa requirements for X citizens" page: a main wikitable of destinations
plus a smaller, differently-shaped "territories" table that the parser
must correctly ignore. Modeled on the actual markup patterns observed
when fetching the US and Canada pages (wikitable class, <sup> footnote
markers, multi-line notes cells).
"""

SAMPLE_PAGE_HTML = """
<div class="mw-parser-output">
<p>Visa requirements for Testlandia citizens are administrative entry
restrictions imposed by other states.</p>
<table class="wikitable sortable">
<tbody>
<tr><th>Country</th><th>Visa requirement</th><th>Allowed stay</th><th>Notes</th><th>Reciprocity</th></tr>
<tr><td>Albania</td><td>Visa not required</td><td>1 year</td><td>Must leave for 90 days to reset.<sup id="cite_ref-1">[1]</sup></td><td>No</td></tr>
<tr><td>Australia</td><td>Electronic Travel Authority</td><td>90 days</td><td>eTA fee applies.<sup>[2]</sup></td><td>Yes</td></tr>
<tr><td>Canada</td><td>Visa not required</td><td>6 months</td><td></td><td>Yes</td></tr>
<tr><td>The Bahamas</td><td>Visa not required</td><td>8 months</td><td></td><td>No</td></tr>
<tr><td>Democratic Republic of the Congo</td><td>eVisa</td><td>7 days</td><td>Registration required.</td><td>No</td></tr>
<tr><td>Fake Nonexistent Country</td><td>Visa required</td><td></td><td>Should be logged as unresolved.</td><td>Yes</td></tr>
</tbody>
</table>
<p>Visa requirements for territories:</p>
<table class="wikitable">
<tbody>
<tr><th>Visitor to</th><th>Visa requirement</th><th>Allowed stay</th><th>Notes</th></tr>
<tr><td>Hong Kong</td><td>Visa not required</td><td>90 days</td><td></td></tr>
</tbody>
</table>
</div>
"""
