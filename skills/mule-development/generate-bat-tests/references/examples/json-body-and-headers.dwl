import * from bat::BDD
import * from bat::Assertions
---
describe("GET /test — JSON body and headers") in [
  it must 'return 200, application/json (any charset) and body field response=done' in [
    GET `$(config.url)/test` with {
      headers: {
        "Content-Type": "application/json"
      }
    }
    assert [
      $.response.status mustEqual 200,
      // Content-Type carries a charset (application/json; charset=UTF-8) — match with regex, not mustEqual.
      $.response.headers."Content-Type" mustMatch /application\/json.*/,
      // Assert the PARSED field, never the raw body string: an <ee:transform output application/json>
      // pretty-prints the payload, so a whole-body string mustEqual would fail on whitespace.
      $.response.body.response mustEqual "done"
    ]
  ]
]
