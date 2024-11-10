# -*- coding: utf-8 -*-
# Part of BrowseInfo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
import json
import logging
import copy
import re

import werkzeug
from odoo import http
from odoo.http import request

class OrderIntegration(http.Controller):

    logger = logging.getLogger(__name__)

    @http.route('/api/v1/orders', methods=["POST"], type="http", auth="none", csrf=False)
    def grubtech_order_create(self, **kwargs):
        ###hamiltontech-ishbek17-main-15486349#### db
        request.session.authenticate("hamiltontech-eshbek17-main-16152605", "api", "api")
        # request.session.authenticate("test_order", "admin", "admin")
        order:dict = json.loads(request.httprequest.data)
        pos_config = request.env['pos.config'].search_read([("id", "=", order['storeId'])], ['id','current_session_id','name','sequence_id','default_fiscal_position_id','pricelist_id'], limit=1)
        store_id = order['storeId']

        if not pos_config:
            return werkzeug.wrappers.Response(
            status=400,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps({"status": "failed",
                                "message": f"store not found there is no store in with id = {store_id} in the system"}, default=str)
        )

        pricelist_id = pos_config[0]['pricelist_id']
        if not pricelist_id:
            return werkzeug.wrappers.Response(
            status=400,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps({"status": "failed",
                                "message": f"store must be have defult price list, there is no defult price list with pos of branch id = {store_id}"}, default=str)
        )
        lines = []
        for item in order['items']:

            price_extra = []
            attribute_value_ids = []
            for mod in item['modifiers']:
                attr_name = mod['name']
                mod_id = request.env['product.attribute.value'].sudo().search([('name','=',attr_name)])
                price_extra.append(mod['price']['totalPrice']['amount'])
                if mod_id:
                    attribute_value_ids.append(mod_id)
                    print("@@@@@@@@@@@@@@@@@@22",mod_id)
            print("###################",attribute_value_ids)
            price_unit = item['price']['totalPrice']['amount']
            price_subtotal_incl = item['price']['totalPrice']['amount']
            discount = item['price']['discountamount']['amount']
            price_subtotal = price_unit - (price_unit * discount) if discount else price_unit
            attr_names = [str(attr.name) for attr in attribute_value_ids]
            
            line = [0, 0, { 'skip_change': False,
                            'qty': item['quantity'], 
                            'price_unit': price_unit, 
                            'price_subtotal': price_subtotal, 
                            'price_subtotal_incl': price_subtotal_incl, 
                            'discount': discount, 
                            'product_id': int(item['id']), 
                            'tax_ids': [[6, False, [1]]], ##############ask about tax
                            'attribute_value_ids': [attr.id for attr in attribute_value_ids], 
                            'full_product_name': item['name'] + f'  ({",".join(attr_names)})',
                            'price_extra': (sum(price_extra)),
                            'customer_note': '', 
                            'line_note': '', 
                            'line_flag': False, 
                            }]
            lines.append(line)


        print("/-/-/-/-/-/",lines)
        print("++++++++++++++++",pos_config[0]['pricelist_id'][0])
        self.logger.info(f"response.content*************{order}")

        session_id = pos_config[0].get(['current_session_id'][0],False)
        if not session_id:
            branch_name = pos_config[0]['name']
            return werkzeug.wrappers.Response(
            status=400,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps({
                                "status": "failed",
                                "message": f"this branch is currently closed there is no active session for branch with id = {store_id}"}, default=str))

        order.update({
            'branch_id':pos_config[0]['id'],
            'session_id': session_id[0],
            'lines':lines,
            # 'delivery_date':'2024-08-31 12:11:08',
            'delivery_date':re.sub(r'\.\d+', '', order['placedAt']),
            'fiscal_position_id':pos_config[0]['default_fiscal_position_id'],
            'pricelist_id':pos_config[0]['pricelist_id'][0],
            'amount_total':100,
            'amount_tax':1,
            'partner_id':self.get_or_create_partner(order['customer']['name'],order['customer']['contactNumber']),
            'company_id':'1',
            'note':'from api',
            'priority':2,
            'grubtech_order_id':order['id']
                              })
        print("$$$$$$$$$$$$$$$",order)
        self.logger.info(f"pos_call_order_data*************{order}")
        pos_order = request.env['pos.call.order'].create_pos_call_order(request.env['pos.call.order']._order_fields(order))
        print(11111111111,pos_order)
        res = {}
        res['ishbic_order_id'] = order['id']
        res['odoo_order_id'] = pos_order['result'][0]['id']
        res['storeId'] = order['storeId']
        res['placedAt'] = order['placedAt']
        res['source'] = order['source']
        res['customer'] = order['customer']
        res['items'] = [ {"product_id" : product['id'],"product_name" : product['name'],"quantity" : product['quantity']} for product in order['items']]
        res['charges'] = order['payment']['charges']
        # self.logger.warning(f"// form main controller pos_order {pos_order}")
        # if pos_order:
        #     print(8888888888888888888888,pos_order)
        #     with_user = request.env['ir.config_parameter'].sudo()
        #     bi_grubtech_service_id = with_user.get_param('bi_grubtech_integration.bi_grubtech_service_id')
        #     api_url = 'v1/commonpos/v1/' + bi_grubtech_service_id + '/orders/' + pos_order['result'][0]['grubtech_order_id'] + "/accept"
        #     self.logger.info(f"-----------{pos_order['result'][0]['grubtech_order_id']}")
        #     try:
        #         response = request.env['grubtech.api.request'].request_grubtech_api(api_url, data=[], method="post")
        #     except Exception as e:
        #         print(e)
            # if response.get('status') == 204:
            #     pos_order.write({'grubtech_order_id': response.get('externalReferenceId')})

        return werkzeug.wrappers.Response(
        status=200,
        content_type="application/json; charset=utf-8",
        headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
        response=json.dumps({
                                "status": "success",
                                "message": "Order successfully placed.",
                                "data": res
                            }, default=str)
    )

    
    def fix_datetime_format(self,date_str):
        try:
            # Parse the original datetime string
            dt = datetime.strptime(date_str, '%Y-%m-%dT%H:%M:%S.%fZ')
            # Convert it to the desired format
            fixed_date_str = dt.strftime('%Y-%m-%d %H:%M:%S')
            return str(fixed_date_str)
        except ValueError as e:
            print(f"Error parsing date: {e}")
            return None
        
    def get_or_create_partner(self,name,phone_number):
        partner_id = request.env['res.partner'].sudo().search([('mobile','=',phone_number)])
        if partner_id:
            return partner_id.id 
        else:
            partner_id = request.env['res.partner'].sudo().create({"name":name,"mobile":phone_number})
            print(3333333333333333333333333,partner_id)
            return partner_id.id 
