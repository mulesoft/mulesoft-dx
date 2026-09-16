import * from bat::BDD
import * from bat::Assertions
---
describe("POST /orders — missing auth") in [
  it must 'reject a request with no Authorization header with 401 UNAUTHORIZED' in [
    POST `$(config.url)/orders` with {
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        customerId: "cust_42",
        items: [{ productId: "SKU_A", qty: 1, unitPrice: 10.0 }]
      }
    }
    assert [
      $.response.status mustEqual 401,
      $.response.body.code mustEqual "UNAUTHORIZED"
    ]
  ]
]
