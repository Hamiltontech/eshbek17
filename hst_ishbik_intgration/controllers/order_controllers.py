# -*- coding: utf-8 -*-
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
    def ishbic_order_create(self, **kwargs):
        request.session.authenticate(request.db, "api", "api")
        order:dict = json.loads(request.httprequest.data)
        
        #validate the data
        validated_data = self._order_data_validation(order)
        if validated_data['status'] == 'failed':
            return werkzeug.wrappers.Response(
                    status=400,
                    content_type="application/json; charset=utf-8",
                    headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Headers","*")],
                    response=json.dumps( validated_data, default=str)
                )
        if validated_data['status'] == 'success':
            session_id = validated_data['session_id']
            branch_name = validated_data['branch_name']
            branch_id = validated_data['branch_id']
            fiscal_position_id = validated_data['fiscal_position_id']
            pricelist_id = validated_data['pricelist_id']
            payment_method_id = validated_data['payment_method_id']
            
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
            
        if int(order['payment']['charges']['deliveryFee']['amount']) > 0:
            delivery_fee = order['payment']['charges']['deliveryFee']['amount']
            delivery_line = [0, 0, { 'skip_change': False,
                            'qty': 1, 
                            'price_unit': delivery_fee, 
                            'price_subtotal': delivery_fee, 
                            'price_subtotal_incl': delivery_fee, 
                            'discount': 0, 
                            'product_id': self.get_product_id_by_internal_ref('Delivery_Fee'), 
                            'attribute_value_ids': [], 
                            'full_product_name': "Delivery Fee",
                            'price_extra': delivery_fee,
                            'customer_note': '', 
                            'line_note': '', 
                            'line_flag': False, 
                            }]
            lines.append(delivery_line)
        
        if order['payment']['charges']['discounts']:
            for discount in order['payment']['charges']['discounts']:
                discount_amount = discount['amount']
                discount_type = discount['type']
                source = order['source']['name']
                discount_line = [0, 0, { 'skip_change': False,
                                'qty': 1, 
                                'price_unit': discount_amount * -1, 
                                'price_subtotal': discount_amount  * -1, 
                                'price_subtotal_incl': discount_amount * -1, 
                                'discount': 0, 
                                'product_id': self.get_product_id_by_internal_ref(discount_type,source), 
                                'attribute_value_ids': [], 
                                'full_product_name': "discount",
                                'price_extra': 0,
                                'customer_note': '', 
                                'line_note': '', 
                                'line_flag': False, 
                                }]
                lines.append(discount_line)

        order.update({
            # to do add the order id as a ref and make it uniqe
            # to do add the descounts as discount type and amount
            # to do add instructions
            # to do add the invoiceNo
            # to do add the type one of ('DELIVERY_BY_FOOD_AGGREGATOR','DINE_IN','PICK_UP','DELIVERY_BY_RESTAURANT',)
            # ask for "delivery": [], what is it for+
            # todo add "source": {"name": "talabat","uniqueOrderId": "1555347774","channel": "talabat","placedAt": "2024-04-30 7:50:23.436454","shortCode": "4529"},
            # todo add "scheduledOrder": null,
            'branch_id':branch_id,
            'session_id': session_id[0],
            'lines':lines,
            'delivery_date':re.sub(r'\.\d+', '', order['placedAt']),
            'fiscal_position_id':fiscal_position_id,
            'pricelist_id':pricelist_id,
            'amount_total':100,
            'amount_tax':1,
            'partner_id':self.get_or_create_partner(order['customer']['name'],order['customer']['contactNumber']),
            'company_id':'1',
            'note':'from api',
            'grubtech_order_id':order['id'],
            # 'discounts':self.add_discounts(order['payment']['charges']['discounts'],order['source']['name']),
            'delivery_fee':order['payment']['charges']['deliveryFee']['amount'],
            'order_type':order['type'],
            'payment_method_id':payment_method_id.id,
            })
        
        pos_order = request.env['pos.call.order'].create_pos_call_order(request.env['pos.call.order']._order_fields(order))
        
        res = {
        'ishbic_order_id': order['id'],
        'odoo_order_id': pos_order['result'][0]['id'],
        'storeId': order['storeId'],
        'placedAt': order['placedAt'],
        'source':order['source'],
        'customer': order['customer'],
        'items': [{"product_id": product['id'],
                   "product_name": product['name'],
                   "quantity": product['quantity']} for product in order['items']],
        'charges': order['payment']['charges']
        }
        
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
            return partner_id.id 

    def add_discounts(self,discounts,source):
        discount_list = []
        for discount in discounts:
            if discount['type'] == 'FOOD_AGGRIGATTOR_DISCOUNT':
                discount['type'] = source
            record = request.env['pos.call.order.discount'].create({
                'discount_type': discount['type'],
                'amount': discount['amount'],
                'source': source
            })
            discount_list.append(record.id)
        return discount_list
    
    def get_product_id_by_internal_ref(self,internal_ref=None, source=None):
        if internal_ref == 'FOOD_AGGRIGATTOR_DISCOUNT':
            product_id = request.env['product.template'].sudo().search([('default_code','=',source.upper())])
            if product_id:
                return product_id.id
            else:
                return

        product_id = request.env['product.template'].sudo().search([('default_code','=',internal_ref)])
        if product_id:
            return product_id.id
        else:
            return False
        
    def _order_data_validation(self, order):
        
        # Check if the order store ID is present
        pos_config = request.env['pos.config'].search_read([("id", "=", order['storeId'])], ['id','current_session_id','name','sequence_id','default_fiscal_position_id','pricelist_id'], limit=1)
        store_id = order['storeId']
        if not pos_config:
            self.logger.info(json.dumps({"status": "failed","message": f"store not found there is no store in with id = {store_id} in the system"}, default=str))
            return {"status": "failed",
                    "message": f"store not found there is no store in with id = {store_id} in the system"}

        # Check if the order has a valid pricelist ID
        pricelist_id = pos_config[0]['pricelist_id']
        if not pricelist_id:
            self.logger.info(json.dumps({"status": "failed","message": f"store must be have defult price list, there is no defult price list with pos of branch id = {store_id}"}, default=str))
            return {"status": "failed",
                    "message": f"store must be have defult price list, there is no defult price list with pos of branch id = {store_id}"}
            
        # Check if the branch has an active session
        session_id = pos_config[0].get(['current_session_id'][0],False)
        branch_name = pos_config[0]['name']
        branch_id = pos_config[0]['id']
        if not session_id:
            self.logger.info(json.dumps({"status": "failed","message": f"this branch is currently closed there is no active session for branch with id = {store_id} and name = {branch_name}"}, default=str))
            return {"status": "failed",
                    "message": f"this branch is currently closed there is no active session for branch with id = {store_id} and name = {branch_name}"}
            
        # Check if the payment method is valid
        payment_method_id = request.env['pos.payment.method'].search([('name','=',order.get('payment',{}).get('method','').capitalize())])
        if not payment_method_id:
            return{"status": "failed",
                    "message": f"Payment method = \'{order.get('payment',{}).get('method','None').capitalize()}\' not found in the system [Not Case sensitive]"}
            
        # if the data is valid return session data
        fiscal_position_id = pos_config[0]['default_fiscal_position_id']
        pricelist_id = pos_config[0]['pricelist_id'][0]
        return {"status": "success",
                "session_id": session_id,
                "branch_name":branch_name,
                "branch_id":branch_id,
                "fiscal_position_id":fiscal_position_id,
                "pricelist_id":pricelist_id,
                "payment_method_id":payment_method_id}