# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import logging
from datetime import timedelta
from functools import partial
from itertools import groupby
from collections import defaultdict

import psycopg2
import pytz
import re

from odoo import api, fields, models, tools, _
from odoo.tools import float_is_zero, float_round, float_repr, float_compare
from odoo.exceptions import ValidationError, UserError
from odoo.osv.expression import AND
import base64

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = "pos.order"

    ishbic_order_id = fields.Char(string="ishbic Order Id", help="Order id received from ishbic")
    pos_cancel_reason = fields.Text(string="Cancel Reason")
    pos_cancel_by = fields.Many2one('res.users', string='Cancelled By')

    def _order_fields(self, ui_order):
        order_fields = super(PosOrder, self)._order_fields(ui_order)
        _logger.info(f'{order_fields}')
        return order_fields

    def create_pos_order(self, order):
        pos_order_obj = self.create(self._order_fields(order))
        order_vals = self.prepare_grubtech_order_vals(self._order_fields(order))
        response = self.env['grubtech.api.request'].request_grubtech_api(
            'common-pos/v1/orders', data=order_vals, method="post",
            api_type="order")
        if response.get('status') == 200:
            pos_order_obj.write({'grubtech_order_id': response.get('externalReferenceId')})
        return {'result': pos_order_obj.read([])}

    @api.model
    def _process_order(self, order, draft, existing_order):
        """Create or update an pos.order from a given dictionary.

        :param dict order: dictionary representing the order.
        :param bool draft: Indicate that the pos_order is not validated yet.
        :param existing_order: order to be updated or False.
        :type existing_order: pos.order.
        :returns: id of created/updated pos.order
        :rtype: int
        """
        order = order['data']
        pos_session = self.env['pos.session'].browse(order['pos_session_id'])
        if pos_session.state == 'closing_control' or pos_session.state == 'closed':
            order['pos_session_id'] = self._get_valid_session(order).id

        pos_order = False
        if not existing_order:
            pos_order = self.create(self._order_fields(order))
           
        else:
            pos_order = existing_order
            pos_order.lines.unlink()
            order['user_id'] = pos_order.user_id.id
            pos_order.write(self._order_fields(order))

        pos_order = pos_order.with_company(pos_order.company_id)
        self = self.with_company(pos_order.company_id)
        self._process_payment_lines(order, pos_order, pos_session, draft)

        if not draft:
            try:
                pos_order.action_pos_order_paid()
            except psycopg2.DatabaseError:
                # do not hide transactional errors, the order(s) won't be saved!
                raise
            except Exception as e:
                _logger.error('Could not fully process the POS Order: %s', tools.ustr(e))
            pos_order._create_order_picking()
            pos_order._compute_total_cost_in_real_time()

        if pos_order.to_invoice and pos_order.state == 'paid':
            pos_order._generate_pos_order_invoice()
        return pos_order.id

    def prepare_grubtech_order_vals(self, order_vals):
        with_user = self.env['ir.config_parameter'].sudo()
        bi_grubtech_store_id = with_user.get_param('bi_grubtech_integration.bi_grubtech_store_id')
        partner = self.env['res.partner'].browse(order_vals.get('partner_id'))
        lines = order_vals.get('lines')
        order_lines = self.prepare_order_items(lines, order_vals)
        payment = self.prepare_order_payment_vals(lines, order_vals)
        order_values = {
            "id": order_vals.get('pos_reference'),
            "storeId": bi_grubtech_store_id,
            "displayId": order_vals.get('grubtech_order_display_id'),
            "type": order_vals.get('grubtech_order_type'),
            "customer": {
                "name": partner.name,
                "contactNumber": partner.phone,
                "email": partner.email
            },
            "items": order_lines,
            "payment": payment,
            "source": {
                "name": order_vals.get('pos_reference'),
                "uniqueOrderId": order_vals.get('pos_reference')
            },
            "status": "OrderCreated",
        }
        _logger.info(f"ORDER VALUES FROM POSORDER.prepare_grubtech_order_vals{order_values}")
        return order_values

    def prepare_order_items(self, lines, order_vals):
        order_items = []
        pricelist_obj = self.env['product.pricelist'].browse(order_vals.get('pricelist_id'))
        currency_name = pricelist_obj.currency_id.name if pricelist_obj else "USD"
        for line in lines:
            order_items.append({
                "id": line[2].get('name'),
                "quantity": line[2].get('qty'),
                "price": {
                    "unitPrice": {
                        "amount": line[2].get('price_unit'),
                        "currencyCode": currency_name,
                        "formattedAmount": currency_name + " " + str(line[2].get('price_unit'))
                    },
                    "discountAmount": {
                        "amount": 0.00,
                        "currencyCode": currency_name,
                        "formattedAmount": currency_name + " 0.00"
                    },
                    "taxAmount": {
                        "amount": order_vals.get('amount_tax'),
                        "currencyCode": currency_name,
                        "formattedAmount": currency_name + " " + str(order_vals.get('amount_tax'))
                    },
                    "totalPrice": {
                        "amount": order_vals.get('amount_total'),
                        "currencyCode": currency_name,
                        "formattedAmount": currency_name + " " + str(order_vals.get('amount_total'))
                    }
                },
                "modifiers": [
                    {
                        "id": line[2].get('name'),
                        "quantity": line[2].get('qty'),
                        "price": {
                            "unitPrice": {
                                "amount": line[2].get('price_unit'),
                                "currencyCode": currency_name,
                                "formattedAmount": currency_name + " " + str(line[2].get('price_unit'))
                            },
                            "discountAmount": {
                                "amount": 0.00,
                                "currencyCode": currency_name,
                                "formattedAmount": currency_name + " 0.00"
                            },
                            "taxAmount": {
                                "amount": order_vals.get('amount_tax'),
                                "currencyCode": currency_name,
                                "formattedAmount": currency_name + " " + str(order_vals.get('amount_tax'))
                            },
                            "totalPrice": {
                                "amount": order_vals.get('amount_total'),
                                "currencyCode": currency_name,
                                "formattedAmount": currency_name + " " + str(order_vals.get('amount_total'))
                            }
                        }
                    }
                ]
            })

        return order_items

    def prepare_order_payment_vals(self,order_vals, lines):
        print("==================================",order_vals)
        payment_vals = []
        pricelist_obj = self.env['product.pricelist'].browse(1)
        print("++++++++++++++++++++++",order_vals)
        currency_name = pricelist_obj.currency_id.name if pricelist_obj else "USD"
        lines = []
        for line in lines:
            payment_vals.append({
                "status": order_vals.get('grubtech_order_payment_status'),
                "method": order_vals.get('grubtech_order_payment_method'),
                "charges": {
                  "subTotal": {
                    "amount": line[2].get('price_subtotal_incl'),
                    "currencyCode": currency_name,
                    "formattedAmount": currency_name + " " + str(line[2].get('price_subtotal_incl'))
                  },
                  "total": {
                    "amount": order_vals.get('amount_total'),
                    "currencyCode": currency_name,
                    "formattedAmount": currency_name + " " + str(order_vals.get('amount_total'))
                  },
                  "deliveryFee": {
                    "amount": order_vals.get('price_subtotal_incl'),
                    "currencyCode": currency_name,
                    "formattedAmount": currency_name + " " + str(order_vals.get('price_subtotal_incl'))
                  }
                },
                "tax": [
                  {
                    "amount": {
                        "amount": order_vals.get('amount_tax'),
                        "currencyCode": currency_name,
                        "formattedAmount": currency_name + " " + str(order_vals.get('amount_tax'))
                    },
                    "name": ""
                  }
                ]
            })

        return payment_vals

    def refund_order_amount_to_unifyd(self, order_vals):
        partner = self.env['res.partner'].browse(order_vals.get('partner_id'))
        payload = {
            "email": partner.email,
            "mobile": partner.phone,
            "countryCode": partner.country_id.code,
            "amount": abs(order_vals.get('amount_total'))
        }
        response = self.env['unifyd.api.request'].request_unifyd_api('webhooks/debitPoints', data=payload, method="post")

    def pos_order_cancel(self):
        for order in self:
            if order.session_id.state != 'closed':
                order.picking_ids.action_cancel()
                order.action_pos_order_cancel()

                if order.account_move.state == 'posted':

                    order.account_move.line_ids.remove_move_reconcile()

                    order.account_move.button_draft()
                    order.account_move.button_cancel()

                else:
                    order.account_move.button_draft()
                    order.account_move.button_cancel()

                if order.payment_ids:
                    for statement in order.payment_ids:
                        statement.unlink()

            if order.session_id.state == 'closed':
                order.picking_ids.action_cancel()
                order.action_pos_order_cancel()
                if order.account_move.state == 'posted':

                    order.account_move.line_ids.remove_move_reconcile()

                    order.account_move.button_draft()
                    order.account_move.button_cancel()

                else:
                    order.account_move.button_draft()
                    order.account_move.button_cancel()

                if order.payment_ids:
                    for statement in order.payment_ids:
                        statement.unlink()
            with_user = self.env['ir.config_parameter'].sudo()
            bi_grubtech_service_id = with_user.get_param('bi_grubtech_integration.bi_grubtech_service_id')
            api_url = 'order/v1/' + bi_grubtech_service_id + '/orders/' + order.grubtech_order_id + "/cancel"
            response = self.env['grubtech.api.request'].request_grubtech_api(api_url, data=[], method="post")
