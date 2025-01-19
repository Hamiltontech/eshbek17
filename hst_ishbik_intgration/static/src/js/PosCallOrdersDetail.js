/** @odoo-module */
import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { onMounted } from "@odoo/owl";
import { Order, Orderline } from "@point_of_sale/app/store/models";

export class PosCallOrdersDetail extends AbstractAwaitablePopup {
  static template = "hst_ishbik_intgration.PosCallOrdersDetail";
  static defaultProps = {};

  setup() {
    super.setup();
  }
  GetFormattedDate(date) {
    var month = ("0" + (date.getMonth() + 1)).slice(-2);
    var day = ("0" + date.getDate()).slice(-2);
    var year = date.getFullYear();
    var hour = ("0" + date.getHours()).slice(-2);
    var min = ("0" + date.getMinutes()).slice(-2);
    var seg = ("0" + date.getSeconds()).slice(-2);
    return year + "-" + month + "-" + day + " " + hour + ":" + min + ":" + seg;
  }

  get_order_date(dt) {
    let a = dt.split("T");
    let a1 = a[0] + "T";
    let a2 = a[1] + "Z";
    let final_date = a1 + a2;
    let date = new Date(final_date);
    let new_date = this.GetFormattedDate(date);
    return new_date;
  }
  transfer_order(event) {
    var self = this;
    var id = parseInt($(event.target).data("id"));
    var call_order_id = parseInt($(".transfer_call_order").val());
    if (call_order_id == 0) {
      alert("Please Select Caller");
    } else {
      self.env.services.orm
        .call("pos.call.order", "transfer_order", [id, call_order_id])
        .then(function (order_data) {
          var orders = self.env.services.pos.received_orders;
          for (var a = 0; a < orders.length; a++) {
            if (orders[a].id == id) {
              self.env.services.pos.received_orders.splice(a, 1);
              break;
            }
          }
          self.render();
          self.cancel();
          self.env.services.pos.closeTempScreen();
          self.env.services.pos.showScreen("ProductScreen");
        });
    }
  }
  deliver_order(event) {                    //here we are starting the cycle
    var self = this;
    var order_id = event;
    var order = self.env.services.pos.get_order();
    var orderlines = order.get_orderlines();
    if (orderlines.length == 0) {
      self.env.services.orm
        .call("pos.call.order", "order_deliver", [order_id])
        .then(function (order_data) {
          var receive_order = self.env.services.pos.received_orders;

          for (var j = 0; j < receive_order.length; j++) {
            if (receive_order[j].id == order_id) {
              self.env.services.pos.received_orders.splice(j, 1);
              break;
            }
          }

          var order = self.env.services.pos.get_order();
          console.log(888888888888888,order);
          
          var orderlines = order.get_orderlines();
          console.log(
            "from js after calling order.get_orderlines()",
            orderlines
          );


          if (orderlines.length == 0) {
            self.env.services.orm
            .call("pos.call.order", "get_pos_order", [order_id])
            .then(function (result) {                                             //here our logic starts for payment method
              console.log(
                "from js after calling get_pos_order in py model",
                result
              );
                // order.payment_method = 
                order.partner = undefined;
                // order.add_paymentline(result['payment_method']);
                order.call_order_id = result["name"];
                order.call_id = order_id;
                if (result["partner_id"]) {
                  order.set_partner(
                    self.env.services.pos.db.get_partner_by_id(
                      result["partner_id"]
                    )
                  );
                }
                var order_data = result["orderline"];
                let orderline_price_dict = {};
                for (var i = 0; i < order_data.length; i++) {
                  if (order_data[i].line_flag == true) {
                    orderline_price_dict[order_data[i].product_id[0]] =
                      order_data[i].price_subtotal;
                  }
                }
                let prd_price = 0.0;
                for (var i = 0; i < order_data.length; i++) {
                  //for each order line
                  if (order_data[i].combo_prod_ids.length > 0) {
                    var z_product = self.env.services.pos.db.get_product_by_id(
                      order_data[i].product_id[0]
                    );
                    const a_orderline = new Orderline(
                      { env: self.env },
                      {
                        pos: self.env.services.pos,
                        order: order,
                        product: z_product,
                      }
                    );
                    a_orderline.set_quantity(order_data[i]["qty"], true);
                    a_orderline.set_unit_price(0.0);
                    order.add_orderline(a_orderline);
                    let a = order_data[i].combo_prod_ids;
                    for (var j = 0; j < a.length; j++) {
                      var product = self.env.services.pos.db.get_product_by_id(
                        a[j]
                      );
                      const orderline_1 = new Orderline(
                        { env: self.env },
                        {
                          pos: self.env.services.pos,
                          order: order,
                          product: product,
                        }
                      );
                      orderline_1.set_quantity(1, true);
                      orderline_1.set_unit_price(
                        orderline_price_dict[product.id]
                      );
                      orderline_1.combo_parent_id = a_orderline;
                      order.add_orderline(orderline_1);
                    }
                  } else {
                    if (order_data[i].line_flag == false) {
                      console.log("order object befor .add_product-->", order);
                      var product = self.env.services.pos.db.get_product_by_id(
                        order_data[i]["product_id"][0]
                      );
                      order.add_product(product, {
                        quantity: order_data[i]["qty"],
                        discount: order_data[i]["discount"],
                        attribute_value_ids:
                          order_data[i]["attribute_value_ids"],
                        price_extra: order_data[i]["price_extra"],
                        customer_note: order_data[i]["customer_note"],
                      }); //manipulate here when adding the product
                    }
                  }

                }
                if (result["payment_method"] == "Cash") {
                self.cancel();
                self.env.services.pos.closeTempScreen();
                self.env.services.pos.showScreen("IshbikPaymentScreen");
                } else {
                  console.log("orrrrrrrrrrrrrder",self);
                  self.cancel();
                  self.env.services.pos.closeTempScreen();
                  self.env.services.pos.showScreen("ReceiveScreenWidget");
                }
              });
          }
        });
    } else {
      alert(_t("Please remove all products from cart and try again."));
    }
  }
}
