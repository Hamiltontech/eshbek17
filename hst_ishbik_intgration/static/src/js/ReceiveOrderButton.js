/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";

export class ReceiveOrderButton extends Component {
  static template = "hst_ishbik_intgration.ReceiveOrderButton";

  setup() {
    this.pos = usePos();
    this.popup = useService("popup");
  }
  async onClick() {
    var self = this;
    var config_id = self.env.services.pos.config.id;
    self.env.services.orm
      .call("pos.call.order", "get_call_orders", [config_id])
      .then(function (order_data) {
        self.env.services.pos.received_orders = [];
        var rec_data = order_data["data"];
        for (var k = 0; k < rec_data.length; k++) {
          self.env.services.pos.received_orders.push(rec_data[k]);
        }
        self.env.services.pos.showScreen("ReceiveScreenWidget")

      });
  }
}

ProductScreen.addControlButton({
  component: ReceiveOrderButton,
  condition: function () {
    return this.pos.config.is_branch;
  },
});
