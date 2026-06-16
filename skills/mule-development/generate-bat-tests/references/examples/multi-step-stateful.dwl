import * from bat::BDD
import * from bat::Assertions
import * from bat::Mutable

var context = HashMap()
---
describe("PATCH /orders/{id}/cancel — pending order") in [
  it must 'cancel a pending order and update the timestamp' in [
    POST `$(config.url)/orders` with {
      headers: {
        Authorization: config.token,
        "Content-Type": "application/json"
      },
      body: {
        customerId: "c1",
        items: [{ productId: "P", qty: 1, unitPrice: 1.0 }]
      }
    } assert [
      $.response.status mustEqual 201
    ] execute [
      context.set("seededId", $.response.body.id)
    ],

    PATCH `$(config.url)/orders/$(context.get("seededId"))/cancel` with {
      headers: { Authorization: config.token }
    } assert [
      $.response.status mustEqual 200,
      $.response.body.status mustEqual "cancelled",
      $.response.body.updatedAt mustMatch /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/
    ]
  ]
]
