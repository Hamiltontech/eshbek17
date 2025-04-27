/** @odoo-module */
import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { useService } from "@web/core/utils/hooks";
import { Order, Orderline } from "@point_of_sale/app/store/models";
import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { useErrorHandlers, useAsyncLockedMethod } from "@point_of_sale/app/utils/hooks";
import { registry } from "@web/core/registry";


import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { DatePickerPopup } from "@point_of_sale/app/utils/date_picker_popup/date_picker_popup";
import { ConfirmPopup } from "@point_of_sale/app/utils/confirm_popup/confirm_popup";
import { ConnectionLostError } from "@web/core/network/rpc_service";

import { IshbikPaymentScreenPaymentLines } from "@hst_ishbik_intgration/ishbik_payment_screen/ishbik_payment_lines/ishbik_payment_lines";
import { IshbikPaymentScreenStatus } from "@hst_ishbik_intgration/ishbik_payment_screen/ishbik_payment_status/ishbik_payment_status";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component, useState, onMounted } from "@odoo/owl";
import { Numpad } from "@point_of_sale/app/generic_components/numpad/numpad";
import { floatIsZero, roundPrecision as round_pr } from "@web/core/utils/numbers";
import { sprintf } from "@web/core/utils/strings";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

export class PosCallOrdersDetail extends AbstractAwaitablePopup {
  static template = "hst_ishbik_intgration.PosCallOrdersDetail";
  static defaultProps = {};

  setup() {
    this.pos = usePos();
    this.ui = useState(useService("ui"));
    this.orm = useService("orm");
    this.popup = useService("popup");
    this.report = useService("report");
    this.notification = useService("pos_notification");
    this.hardwareProxy = useService("hardware_proxy");
    this.printer = useService("printer");
    this.payment_methods_from_config = this.pos.payment_methods.filter((method) =>
        method.name == "Cash" || method.name == "Bank"
    );
    this.numberBuffer = useService("number_buffer");
    this.numberBuffer.use(this._getNumberBufferConfig);
    useErrorHandlers();
    this.payment_interface = null;
    this.error = false;
    this.validateOrder = useAsyncLockedMethod(this.validateOrder);
}
getNumpadButtons() {
  return [
      { value: "1" },
      { value: "2" },
      { value: "3" },
      { value: "+10" },
      { value: "4" },
      { value: "5" },
      { value: "6" },
      { value: "+20" },
      { value: "7" },
      { value: "8" },
      { value: "9" },
      { value: "+50" },
      { value: "-", text: "+/-" },
      { value: "0" },
      { value: this.env.services.localization.decimalPoint },
      { value: "Backspace", text: "⌫" },
  ];
}

showMaxValueError() {
  this.popup.add(ErrorPopup, {
      title: _t("Maximum value reached"),
      body: _t(
          "The amount cannot be higher than the due amount if you don't have a cash payment method configured."
      ),
  });
}
get _getNumberBufferConfig() {
  const config = {
      // When the buffer is updated, trigger this event.
      // Note that the component listens to it.
      triggerAtInput: () => this.updateSelectedPaymentline(),
      useWithBarcode: true,
  };

  return config;
}
get currentOrder() {
  return this.pos.get_order();
}
get paymentLines() {
  return this.currentOrder.get_paymentlines();
}
get selectedPaymentLine() {
  return this.currentOrder.selected_paymentline;
}
async selectPartner(isEditMode = false, missingFields = []) {
  // IMPROVEMENT: This code snippet is repeated multiple times.
  // Maybe it's better to create a function for it.
  const currentPartner = this.currentOrder.get_partner();
  const partnerScreenProps = { partner: currentPartner };
  if (isEditMode && currentPartner) {
      partnerScreenProps.editModeProps = true;
      partnerScreenProps.missingFields = missingFields;
  }
  const { confirmed, payload: newPartner } = await this.pos.showTempScreen(
      "PartnerListScreen",
      partnerScreenProps
  );
  if (confirmed) {
      this.currentOrder.set_partner(newPartner);
  }
}
addNewPaymentLine(paymentMethod) {
  // original function: click_paymentmethods
  const result = this.currentOrder.add_paymentline(paymentMethod);
  if (!this.pos.get_order().check_paymentlines_rounding()) {
      this._display_popup_error_paymentlines_rounding();
  }
  if (result) {
      this.numberBuffer.reset();
      return true;
  } else {
      this.popup.add(ErrorPopup, {
          title: _t("Error"),
          body: _t("There is already an electronic payment in progress."),
      });
      return false;
  }
}
updateSelectedPaymentline(amount = false) {
  if (this.paymentLines.every((line) => line.paid)) {
      this.currentOrder.add_paymentline(this.payment_methods_from_config[0]);
  }
  if (!this.selectedPaymentLine) {
      return;
  } // do nothing if no selected payment line
  if (amount === false) {
      if (this.numberBuffer.get() === null) {
          amount = null;
      } else if (this.numberBuffer.get() === "") {
          amount = 0;
      } else {
          amount = this.numberBuffer.getFloat();
      }
  }
  // disable changing amount on paymentlines with running or done payments on a payment terminal
  const payment_terminal = this.selectedPaymentLine.payment_method.payment_terminal;
  const hasCashPaymentMethod = this.payment_methods_from_config.some(
      (method) => method.type === "cash"
  );
  if (
      !hasCashPaymentMethod &&
      amount > this.currentOrder.get_due() + this.selectedPaymentLine.amount
  ) {
      this.selectedPaymentLine.set_amount(0);
      this.numberBuffer.set(this.currentOrder.get_due().toString());
      amount = this.currentOrder.get_due();
      this.showMaxValueError();
  }
  if (
      payment_terminal &&
      !["pending", "retry"].includes(this.selectedPaymentLine.get_payment_status())
  ) {
      return;
  }
  if (amount === null) {
      this.deletePaymentLine(this.selectedPaymentLine.cid);
  } else {
      this.selectedPaymentLine.set_amount(amount);
  }
}
toggleIsToInvoice() {
  this.currentOrder.set_to_invoice(!this.currentOrder.is_to_invoice());
}
openCashbox() {
  this.hardwareProxy.openCashbox();
}
async addTip() {
  // click_tip
  const tip = this.currentOrder.get_tip();
  const change = this.currentOrder.get_change();
  const value = tip === 0 && change > 0 ? change : tip;

  const { confirmed, payload } = await this.popup.add(NumberPopup, {
      title: tip ? _t("Change Tip") : _t("Add Tip"),
      startingValue: value,
      isInputSelected: true,
      nbrDecimal: this.pos.currency.decimal_places,
      inputSuffix: this.pos.currency.symbol,
  });

  if (confirmed) {
      this.currentOrder.set_tip(parseFloat(payload ?? ""));
  }
}
async toggleShippingDatePicker() {
  if (!this.currentOrder.getShippingDate()) {
      const { confirmed, payload: shippingDate } = await this.popup.add(DatePickerPopup, {
          title: _t("Select the shipping date"),
      });
      if (confirmed) {
          this.currentOrder.setShippingDate(shippingDate);
      }
  } else {
      this.currentOrder.setShippingDate(false);
  }
}
deletePaymentLine(cid) {
  const line = this.paymentLines.find((line) => line.cid === cid);
  // If a paymentline with a payment terminal linked to
  // it is removed, the terminal should get a cancel
  // request.
  if (["waiting", "waitingCard", "timeout"].includes(line.get_payment_status())) {
      line.set_payment_status("waitingCancel");
      line.payment_method.payment_terminal
          .send_payment_cancel(this.currentOrder, cid)
          .then(() => {
              this.currentOrder.remove_paymentline(line);
              this.numberBuffer.reset();
          });
  } else if (line.get_payment_status() !== "waitingCancel") {
      this.currentOrder.remove_paymentline(line);
      this.numberBuffer.reset();
  }
}
selectPaymentLine(cid) {
  const line = this.paymentLines.find((line) => line.cid === cid);
  this.currentOrder.select_paymentline(line);
  this.numberBuffer.reset();
}
async validateOrder(isForceValidate) {
  
  // this.numberBuffer.capture();
  if (this.pos.config.cash_rounding) {
    if (!this.pos.get_order().check_paymentlines_rounding()) {
      this._display_popup_error_paymentlines_rounding();
      return;
    }
  }
  
  if (await this._isOrderValid(isForceValidate)) {
    console.log("000000000000000000");
    // remove pending payments before finalizing the validation
      for (const line of this.paymentLines) {
          if (!line.is_done()) {
              this.currentOrder.remove_paymentline(line);
          }
      }
      await this._finalizeValidation();
  }
}
async _finalizeValidation() {
  
  if (this.currentOrder.is_paid_with_cash() || this.currentOrder.get_change()) {
    this.hardwareProxy.openCashbox();
  }
  
  this.currentOrder.date_order = luxon.DateTime.now();
  for (const line of this.paymentLines) {
    if (!line.amount === 0) {
      this.currentOrder.remove_paymentline(line);
    }
  }
  this.currentOrder.finalized = true;
  
  this.env.services.ui.block();
  let syncOrderResult;
  console.log("_finalizeValidation");
  try {
    // 1. Save order to server.
    syncOrderResult = await this.pos.push_single_order(this.currentOrder);
    if (!syncOrderResult) {
      return;
    }
      // 2. Invoice.
      if (this.shouldDownloadInvoice() && this.currentOrder.is_to_invoice()) {
          if (syncOrderResult[0]?.account_move) {
              await this.report.doAction("account.account_invoices", [
                  syncOrderResult[0].account_move,
              ]);
          } else {
              throw {
                  code: 401,
                  message: "Backend Invoice",
                  data: { order: this.currentOrder },
              };
          }
      }
  } catch (error) {
      if (error instanceof ConnectionLostError) {
          this.pos.showScreen(this.nextScreen);
          Promise.reject(error);
          return error;
      } else {
          throw error;
      }
  } finally {
      this.env.services.ui.unblock();
  }

  // 3. Post process.
  if (
      syncOrderResult &&
      syncOrderResult.length > 0 &&
      this.currentOrder.wait_for_push_order()
  ) {
      await this.postPushOrderResolve(syncOrderResult.map((res) => res.id));
  }

  await this.afterOrderValidation(!!syncOrderResult && syncOrderResult.length > 0);
}
async postPushOrderResolve(ordersServerId) {
  const postPushResult = await this._postPushOrderResolve(this.currentOrder, ordersServerId);
  if (!postPushResult) {
      this.popup.add(ErrorPopup, {
          title: _t("Error: no internet connection."),
          body: _t("Some, if not all, post-processing after syncing order failed."),
      });
  }
}
async afterOrderValidation(suggestToSync = true) {
  // Remove the order from the local storage so that when we refresh the page, the order
  // won't be there
  this.pos.db.remove_unpaid_order(this.currentOrder);

  // Ask the user to sync the remaining unsynced orders.
  if (suggestToSync && this.pos.db.get_orders().length) {
      const { confirmed } = await this.popup.add(ConfirmPopup, {
          title: _t("Remaining unsynced orders"),
          body: _t("There are unsynced orders. Do you want to sync these orders?"),
      });
      if (confirmed) {
          // NOTE: Not yet sure if this should be awaited or not.
          // If awaited, some operations like changing screen
          // might not work.
          this.pos.push_orders();
      }
  }
  // Always show the next screen regardless of error since pos has to
  // continue working even offline.
  let nextScreen = this.nextScreen;

  if (
      nextScreen === "ReceiptScreen" &&
      !this.currentOrder._printed &&
      this.pos.config.iface_print_auto
  ) {
      const invoiced_finalized = this.currentOrder.is_to_invoice()
          ? this.currentOrder.finalized
          : true;

      if (invoiced_finalized) {
          const printResult = await this.printer.print(
              OrderReceipt,
              {
                  data: this.pos.get_order().export_for_printing(),
                  formatCurrency: this.env.utils.formatCurrency,
              },
              { webPrintFallback: true }
          );

          if (printResult && this.pos.config.iface_print_skip_screen) {
              this.pos.removeOrder(this.currentOrder);
              this.pos.add_new_order();
              nextScreen = "ProductScreen";
          }
      }
  }

  this.pos.showScreen(nextScreen);
}
/**
* This method is meant to be overriden by localization that do not want to print the invoice pdf
* every time they create an account move. For example, it can be overriden like this:
* ```
* shouldDownloadInvoice() {
*     const currentCountry = ...
*     if (currentCountry.code === 'FR') {
*         return false;
*     } else {
*         return super.shouldDownloadInvoice(); // or this._super(...arguments) depending on the odoo version.
*     }
* }
* ```
* @returns {boolean} true if the invoice pdf should be downloaded
*/
shouldDownloadInvoice() {
  return true;
}
get nextScreen() {
  return !this.error ? "ReceiptScreen" : "ProductScreen";
}
paymentMethodImage(id) {
  if (this.paymentMethod.image) {
      return `/web/image/pos.payment.method/${id}/image`;
  } else if (this.paymentMethod.type === "cash") {
      return "/point_of_sale/static/src/img/money.png";
  } else if (this.paymentMethod.type === "pay_later") {
      return "/point_of_sale/static/src/img/pay-later.png";
  } else {
      return "/point_of_sale/static/src/img/card-bank.png";
  }
}

async _askForCustomerIfRequired() {
  const splitPayments = this.paymentLines.filter(
      (payment) => payment.payment_method.split_transactions
  );
  if (splitPayments.length && !this.currentOrder.get_partner()) {
      const paymentMethod = splitPayments[0].payment_method;
      const { confirmed } = await this.popup.add(ConfirmPopup, {
          title: _t("Customer Required"),
          body: _t("Customer is required for %s payment method.", paymentMethod.name),
      });
      if (confirmed) {
          this.selectPartner();
      }
      return false;
  }
}

async _isOrderValid(isForceValidate) {
  
  if (this.currentOrder.get_orderlines().length === 0 && this.currentOrder.is_to_invoice()) {
    this.popup.add(ErrorPopup, {
      title: _t("Empty Order"),
      body: _t(
        "There must be at least one product in your order before it can be validated and invoiced."
      ),
    });
      console.log("order validation-------------1");
      return false;
  }

  if ((await this._askForCustomerIfRequired()) === false) {
    console.log("order validation-------------2");
      return false;
  }

  if (
      (this.currentOrder.is_to_invoice() || this.currentOrder.getShippingDate()) &&
      !this.currentOrder.get_partner()
  ) {
      const { confirmed } = await this.popup.add(ConfirmPopup, {
          title: _t("Please select the Customer"),
          body: _t(
              "You need to select the customer before you can invoice or ship an order."
          ),
      });
      if (confirmed) {
          this.selectPartner();
      }
      console.log("order validation-------------3");
      return false;
  }

  const partner = this.currentOrder.get_partner();
  if (
      this.currentOrder.getShippingDate() &&
      !(partner.name && partner.street && partner.city && partner.country_id)
  ) {
      this.popup.add(ErrorPopup, {
          title: _t("Incorrect address for shipping"),
          body: _t("The selected customer needs an address."),
      });
      console.log("order validation-------------4");
      return false;
  }

  if (
      this.currentOrder.get_total_with_tax() != 0 &&
      this.currentOrder.get_paymentlines().length === 0
  ) {
      this.notification.add(_t("Select a payment method to validate the order."));
      console.log("order validation-------------5");
      console.log("****************",this.currentOrder);
      
      return false;
  }

  if (!this.currentOrder.is_paid() || this.invoicing) {
    console.log("order validation-------------6");
      return false;
  }

  if (this.currentOrder.has_not_valid_rounding()) {
      var line = this.currentOrder.has_not_valid_rounding();
      this.popup.add(ErrorPopup, {
          title: _t("Incorrect rounding"),
          body: _t(
              "You have to round your payments lines." + line.amount + " is not rounded."
          ),
      });
      console.log("order validation-------------7");
      return false;
  }

  // The exact amount must be paid if there is no cash payment method defined.
  if (
      Math.abs(
          this.currentOrder.get_total_with_tax() -
              this.currentOrder.get_total_paid() +
              this.currentOrder.get_rounding_applied()
      ) > 0.00001
  ) {
      if (!this.pos.payment_methods.some((pm) => pm.is_cash_count)) {
          this.popup.add(ErrorPopup, {
              title: _t("Cannot return change without a cash payment method"),
              body: _t(
                  "There is no cash payment method available in this point of sale to handle the change.\n\n Please pay the exact amount or add a cash payment method in the point of sale configuration"
              ),
          });
          console.log("order validation-------------8");
          return false;
      }
  }

  // if the change is too large, it's probably an input error, make the user confirm.
  if (
      !isForceValidate &&
      this.currentOrder.get_total_with_tax() > 0 &&
      this.currentOrder.get_total_with_tax() * 1000 < this.currentOrder.get_total_paid()
  ) {
      this.popup
          .add(ConfirmPopup, {
              title: _t("Please Confirm Large Amount"),
              body:
                  _t("Are you sure that the customer wants to  pay") +
                  " " +
                  this.env.utils.formatCurrency(this.currentOrder.get_total_paid()) +
                  " " +
                  _t("for an order of") +
                  " " +
                  this.env.utils.formatCurrency(this.currentOrder.get_total_with_tax()) +
                  " " +
                  _t('? Clicking "Confirm" will validate the payment.'),
          })
          .then(({ confirmed }) => {
              if (confirmed) {
                  this.validateOrder(true);
              }
          });
      console.log("order validation-------------9");
      return false;
  }
  console.log(this.currentOrder,"order validation-------------reason");
  
  if (!this.currentOrder._isValidEmptyOrder()) {
    console.log("order validation-------------10");
      return false;
  }
  console.log("+++++++++++++++++++++++++++++++++++++++++++++");
  return true;
}
async _postPushOrderResolve(order, order_server_ids) {
  return true;
}
async sendPaymentRequest(line) {
  // Other payment lines can not be reversed anymore
  this.numberBuffer.capture();
  this.paymentLines.forEach(function (line) {
      line.can_be_reversed = false;
  });

  const isPaymentSuccessful = await line.pay();
  // Automatically validate the order when after an electronic payment,
  // the current order is fully paid and due is zero.
  const { config, currency } = this.pos;
  const currentOrder = this.pos.get_order();
  if (
      isPaymentSuccessful &&
      currentOrder.is_paid() &&
      floatIsZero(currentOrder.get_due(), currency.decimal_places) &&
      config.auto_validate_terminal_payment
  ) {
      this.validateOrder(false);
  }
}
async sendPaymentCancel(line) {
  const payment_terminal = line.payment_method.payment_terminal;
  line.set_payment_status("waitingCancel");
  const isCancelSuccessful = await payment_terminal.send_payment_cancel(
      this.currentOrder,
      line.cid
  );
  if (isCancelSuccessful) {
      line.set_payment_status("retry");
  } else {
      line.set_payment_status("waitingCard");
  }
}
async sendPaymentReverse(line) {
  const payment_terminal = line.payment_method.payment_terminal;
  line.set_payment_status("reversing");

  const isReversalSuccessful = await payment_terminal.send_payment_reversal(line.cid);
  if (isReversalSuccessful) {
      line.set_amount(0);
      line.set_payment_status("reversed");
  } else {
      line.can_be_reversed = false;
      line.set_payment_status("done");
  }
}
async sendForceDone(line) {
  line.set_payment_status("done");
}

_display_popup_error_paymentlines_rounding() {
  if (this.pos.config.cash_rounding) {
      const orderlines = this.paymentLines;
      const cash_rounding = this.pos.cash_rounding[0].rounding;
      const default_rounding = this.pos.currency.rounding;
      for (var id in orderlines) {
          var line = orderlines[id];
          var diff = round_pr(
              round_pr(line.amount, cash_rounding) - round_pr(line.amount, default_rounding),
              default_rounding
          );

          if (
              diff &&
              (line.payment_method.is_cash_count || !this.pos.config.only_round_cash_method)
          ) {
              const upper_amount = round_pr(
                  round_pr(line.amount, default_rounding) + cash_rounding / 2,
                  cash_rounding
              );
              const lower_amount = round_pr(
                  round_pr(line.amount, default_rounding) - cash_rounding / 2,
                  cash_rounding
              );
              this.popup.add(ErrorPopup, {
                  title: _t("Rounding error in payment lines"),
                  body: sprintf(
                      _t(
                          "The amount of your payment lines must be rounded to validate the transaction.\n" +
                              "The rounding precision is %s so you should set %s or %s as payment amount instead of %s."
                      ),
                      cash_rounding.toFixed(this.pos.currency.decimal_places),
                      lower_amount.toFixed(this.pos.currency.decimal_places),
                      upper_amount.toFixed(this.pos.currency.decimal_places),
                      line.amount.toFixed(this.pos.currency.decimal_places)
                  ),
              });
              return;
          }
      }
  }
}
async apply_discount(pc,discount_type) {
  const order = this.pos.get_order();
  const lines = order.get_orderlines();
  let product_ids_to_not_display_detials = this.pos.db.product_ids_to_not_display.map((id)=>this.pos.db.get_product_by_id(id));
  console.log(discount_type);
  console.log("apply_discount_product",product_ids_to_not_display_detials);
  console.log("^^^^^^^^^^^^^^",order,"~~~~~~~~~~~~~~",lines);
  
  let desc_product_id;
  product_ids_to_not_display_detials.forEach((product)=>{
    if (product.default_code == discount_type){
      desc_product_id = product.id;}})

  console.log("desc_product_id#########",desc_product_id);
  
  const product = this.pos.db.get_product_by_id(desc_product_id);
  if (product === undefined) {
      await this.popup.add(ErrorPopup, {
          title: _t("No discount product found"),
          body: _t(
              "The discount product seems misconfigured. Make sure it is flagged as 'Can be Sold' and 'Available in Point of Sale'."
          ),
      });
      return;
  }

  // Remove existing discounts
  lines.filter((line) => {line.get_product() === product}).forEach((line) => order._unlinkOrderline(line));
  console.log("afffffffffffffffffffter",lines,"************",lines.forEach((line) => {console.log(line.get_product());}),"------------------",product);

  // Add one discount line per tax group
  const linesByTax = order.get_orderlines_grouped_by_tax_ids();
  for (const [tax_ids, lines] of Object.entries(linesByTax)) {
      // Note that tax_ids_array is an Array of tax_ids that apply to these lines
      // That is, the use case of products with more than one tax is supported.
      const tax_ids_array = tax_ids
          .split(",")
          .filter((id) => id !== "")
          .map((id) => Number(id));

      // const baseToDiscount = order.get_total_with_tax();

      // We add the price as manually set to avoid recomputation when changing customer.
      const discount = (-pc);
      if (discount ) {
          order.add_product(product, {
              price: discount,
              lst_price: discount,
              tax_ids: tax_ids_array,
              merge: false,
              description:
                  `${pc}%, ` +
                  (tax_ids_array.length
                      ? _t(
                            "Tax: %s",
                            tax_ids_array
                                .map((taxId) => this.pos.taxes_by_id[taxId].amount + "%")
                                .join(", ")
                        )
                      : _t("No tax")),
              extras: {
                  price_type: "automatic",
              },
          });
      }
  }
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
  
  async deliver_order(event) {                    //here we are starting the cycle
    var self = this;
    var order_id = event;
    var order = self.env.services.pos.get_order();
    var orderlines = order.get_orderlines();
    var amount_total
    if (orderlines.length == 0) {
      await self.env.services.orm
        .call("pos.call.order", "order_deliver", [order_id])
        .then(async function (order_data) {
          var receive_order = self.env.services.pos.received_orders;

          for (var j = 0; j < receive_order.length; j++) {
            if (receive_order[j].id == order_id) {
              self.env.services.pos.received_orders.splice(j, 1);
              break;
            }
          }

          var order = self.env.services.pos.get_order();
          var orderlines = order.get_orderlines();
          console.log(
            "from js after calling order.get_orderlines()",
            orderlines
          );


          if (orderlines.length == 0) {
            await self.env.services.orm
            .call("pos.call.order", "get_pos_order", [order_id])
            .then(async function (result) {                                             //here our logic starts for payment method
              console.log(
                "from js after calling get_pos_order in py model",
                result
              );
              amount_total = result["amount_total"];
                order.partner = undefined;
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
                    a_orderline.set_unit_price(order_data[i]["price_unit"]);
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
                  let pos_order_loaded = self.env.services.pos.get_order();
                  let payment_method = self.env.services.pos.payment_methods.filter((method) =>method.name == result["payment_method"]);
                  pos_order_loaded.add_paymentline(... payment_method);
                  self.cancel();
                  self.env.services.pos.closeTempScreen();
                  self.env.services.pos.showScreen("ReceiveScreenWidget");
                }
              });
            }
          });
        
        await this.validateOrder(false);
    } else {
      alert(_t("Please remove all products from cart and try again."));
    }
  }
}
