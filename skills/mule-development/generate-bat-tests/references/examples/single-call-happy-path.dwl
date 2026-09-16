import * from bat::BDD
import * from bat::Assertions
---
describe("POST /orders — happy path") in [
  it must 'create a 2-item order with total=40.99 and status=pending' in [
    POST `$(config.url)/orders` with {
      headers: {
        Authorization: config.token,
        "Content-Type": "application/json"
      },
      body: {
        customerId: "cust_42",
        items: [
          { productId: "SKU_A", qty: 2, unitPrice: 15.50 },
          { productId: "SKU_B", qty: 1, unitPrice: 9.99 }
        ]
      }
    }
    assert [
      $.response.status mustEqual 201,
      $.response.body.status mustEqual "pending",
      $.response.body.total mustEqual 40.99,
      $.response.body.customerId mustEqual "cust_42",
      sizeOf($.response.body.items) mustEqual 2,
      $.response.body.id mustMatch /ord_\d+/
    ]
  ]
]
