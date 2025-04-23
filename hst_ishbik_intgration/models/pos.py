# -*- coding: utf-8 -*-
# Part of BrowseInfo. See LICENSE file for full copyright and licensing details.

from odoo import api, fields, models, _
import logging
from functools import partial
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT
from datetime import datetime, timedelta
from odoo.exceptions import ValidationError, UserError
import pytz



class POSConfig(models.Model):
	_inherit = 'pos.config' 
	
	is_call_center = fields.Boolean(string='Is Call Center')
	is_branch = fields.Boolean(string='Is a branch')

class ResConfigSettings(models.TransientModel):
	_inherit = 'res.config.settings'

	is_call_center = fields.Boolean(related='pos_config_id.is_call_center', readonly=False)
	is_branch = fields.Boolean(related='pos_config_id.is_branch', readonly=False)


class POSSession(models.Model):
	_inherit = 'pos.session'

	def load_pos_data(self):
		loaded_data = {}
		self = self.with_context(loaded_data=loaded_data)
		for model in self._pos_ui_models_to_load():
			loaded_data[model] = self._load_model(model)
		self._pos_data_process(loaded_data)        
		pos_config_data=self._get_pos_ui_pos_pos_configs(self._loader_params_pos_pos_configs())
		loaded_data['pos_configs'] = pos_config_data
		return loaded_data

	def _loader_params_res_users(self):
		result = super()._loader_params_res_users()
		result['search_params']['fields'].append('user_pin')
		return result


	def _loader_params_pos_pos_configs(self):
		return {
			'search_params': {
				'domain': [('is_branch','=',True)],
				'fields': [
					'id', 'name', 
				],
			},
		}

	def _get_pos_ui_pos_pos_configs(self, params):
		users = self.env['pos.config'].search_read(**params['search_params'])
		return users


class ResUsers(models.Model):
	_inherit = 'res.users'

	user_pin = fields.Integer()

class POSCallOrders(models.Model):
	_name = 'pos.call.order'
	_description='POS Call Orders'
	_order = "id desc"
	logger = logging.getLogger(__name__)

	def _default_session(self):
		return self.env['pos.session'].search([('state', '=', 'opened'), ('user_id', '=', self.env.uid)], limit=1)

	def _default_pricelist(self):
		return self._default_session().config_id.pricelist_id


	@api.model
	def _amount_line_tax(self, line, fiscal_position_id):
		taxes = line.tax_ids.filtered(lambda t: t.company_id.id == line.call_order_id.company_id.id)
		if fiscal_position_id:
			taxes = fiscal_position_id.map_tax(taxes, line.product_id, line.call_order_id.partner_id)
		price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
		taxes = taxes.compute_all(price, line.call_order_id.pricelist_id.currency_id, line.qty, product=line.product_id, partner=line.call_order_id.partner_id or False)['taxes']
		return sum(tax.get('amount', 0.0) for tax in taxes)

	delivery_date = fields.Datetime(string="Delivery Date")
	name = fields.Char(string='Name',required=True, readonly=True, copy=False, default='/')
	lines = fields.One2many('pos.call.order.line', 'call_order_id', string='POS Lines')
	partner_id = fields.Many2one('res.partner', string='Customer')
	order_id = fields.Many2one('pos.order', string='Order Ref.',readonly=True)
	session_id = fields.Many2one('pos.session', string='Session')
	config_id = fields.Many2one('pos.config', related='session_id.config_id', string="Point of Sale")
	amount_tax = fields.Float(compute='_compute_amount_all', string='Taxes', digits=0, readonly=True)
	amount_total = fields.Float(compute='_compute_amount_all', string='Total', digits=0, readonly=True)
	state = fields.Selection(
		[('draft', 'New'), ('cancel', 'Cancelled'), ('confirm','Confirm'),('sent', 'Sent'), ('done', 'Done')],
		'Status', readonly=True, copy=False, default='draft')
	pricelist_id = fields.Many2one('product.pricelist', string='Pricelist', required=True, default=_default_pricelist)
	note = fields.Text(string='Internal Notes')
	branch_id = fields.Many2one('pos.config',string="Branch")
	fiscal_position_id = fields.Many2one('account.fiscal.position', string='Fiscal Position', default=lambda self: self._default_session().config_id.default_fiscal_position_id)
	company_id = fields.Many2one('res.company', string='Company', required=True, readonly=True)
	payment_method_id = fields.Many2one('pos.payment.method', string='Payment Method', required=True)
	discounts = fields.One2many('pos.call.order.discount', 'order_id', string='Discounts')
	delivery_fee = fields.Float(string='Delivery Fee', default=0.0)
	order_type = fields.Selection([('DELIVERY_BY_FOOD_AGGREGATOR','Delevary By Food Aggregator'),('DINE_IN','Dine In'),('PICK_UP','Pick Up'),('DELIVERY_BY_RESTAURANT','Delivery By Restaurant')],string='Order Type')
	

	def cancel_order(self, order, reason_text):
		order = self.env['pos.call.order'].sudo().browse(order)
		order.cancel_reason = reason_text
		order.state = 'cancel'

	@api.depends('lines.price_subtotal_incl', 'lines.discount')
	def _compute_amount_all(self):
		for order in self:
			order.amount_tax = 0.0
			currency = order.pricelist_id.currency_id
			order.amount_tax = currency.round(sum(self._amount_line_tax(line, order.fiscal_position_id) for line in order.lines))
			amount_untaxed = currency.round(sum(line.price_subtotal for line in order.lines))
			order.amount_total = order.amount_tax + amount_untaxed

	@api.model
	def _order_fields(self, ui_order):
		print(f"---------------{ui_order}")
		process_line = partial(self.env['pos.call.order.line']._order_line_fields)
		delivery_date = datetime.strptime(str(ui_order['delivery_date']), "%Y-%m-%d %H:%M:%S")
		# delivery_date_str = delivery_date.strftime(DEFAULT_SERVER_DATETIME_FORMAT)
		return {
			'session_id':   ui_order['session_id'],
			'lines':        [process_line(l) for l in ui_order['lines']] if ui_order['lines'] else False,
			'partner_id':   ui_order['partner_id'] or False,
			'fiscal_position_id': ui_order['fiscal_position_id'],
			'note':         ui_order['note'],
			'company_id': self.env['pos.config'].browse(ui_order['branch_id']).company_id.id,
			'delivery_date':delivery_date,
			'branch_id': ui_order['branch_id'],
			'state':'confirm',
			'amount_tax':ui_order['amount_tax'],
			# 'priority':ui_order['priority'],
			'pricelist_id':ui_order['pricelist_id'],
			'discounts': ui_order['discounts'],
			'delivery_fee': ui_order['delivery_fee'],
			'order_type': ui_order['order_type'],
			'payment_method_id': ui_order['payment_method_id'],
		}

	@api.model
	def order_deliver(self, order_id):
		self.browse(order_id).state = "done"
		return True


	@api.model
	def get_pos_order(self, order_id):
		call_order_obj = self.browse(int(order_id))
		if call_order_obj:
			print(f"??????????????? {call_order_obj.read([])}")
			return {
				'partner_id':call_order_obj.partner_id.id,
				'name':call_order_obj.name,
				'payment_method':call_order_obj.payment_method_id.name,
				'discounts':call_order_obj.discounts.read(['discount_type','amount','source']),
				'amount_total':call_order_obj.amount_total,
				'delivery_fee':call_order_obj.delivery_fee,
				'orderline':call_order_obj.lines.read(['product_id','price_unit','qty','discount','tax_ids','combo_prod_ids','line_flag','price_subtotal_incl','price_subtotal','attribute_value_ids','price_extra','customer_note']), #here
			}
		return False

	@api.model
	def get_transfer_orders(self,config_id):
		orders_data = []
		for order in self.search([('state','in',['sent','confirm'])]):
			orders_data.append(order.read(['id','name','delivery_date','amount_total','partner_id','lines','state','branch_id']))
		return {'data':orders_data}


	@api.model
	def transfer_order(self, order_id,branch_id):
		self.browse(order_id).branch_id = branch_id
		return {'data':'sent'}

	@api.model
	def get_call_orders(self,config_id): #TODO HERE
		print("function in python ------------------>>","get_call_orders")
		orders_data = []
		call_ids = []
		call_orders=self.search([('state','=','confirm'),('branch_id','=',config_id)])
		print("call orders = ",call_orders)
		for order in call_orders:
			order_line = []
			for line in order.lines:
				order_line.append({
					'qty': line.qty,
					'attribute_value_ids': line.attribute_value_ids.filtered(lambda av: av.ptav_active).ids,
					'price_unit': line.price_unit,
					'price_subtotal': line.price_subtotal,
					'price_subtotal_incl': line.price_subtotal_incl,
					'product_id': line.product_id.id,
					'discount': line.discount,
					'tax_ids': [[6, False, line.tax_ids.mapped(lambda tax: tax.id)]],
					'price_extra': line.price_extra,
					'full_product_name': line.full_product_name,
					# 'combo_parent_id': line.combo_parent_id.id if line.combo_parent_id else None,
					# 'combo_line_ids': line.combo_line_ids.mapped('id'),
					'product_id':line.product_id.id,
					'product_name':line.product_id.name,
					'qty':line.qty,
					'note':line.extra_note,
					'order_line_status':'0',
					'price_unit':line.price_unit,
					'price_subtotal_incl':line.price_subtotal_incl,
					'discount':line.discount,
					'attribute_value_ids':[l.id for l in line.attribute_value_ids],
					'customer_note':line.customer_note
					})
			call_ids.append(order.id)
			user_tz = self.env.user.tz
			orders_data.append({
				'id':order.id,
				'name':order.name,
				'is_hidden':True,
				'delivery_date':datetime.strftime(pytz.utc.localize(datetime.strptime(str(order.delivery_date),DEFAULT_SERVER_DATETIME_FORMAT)).astimezone(pytz.timezone(user_tz)),"%Y-%m-%dT%H:%M:%S") if self.env.user.tz else order.delivery_date,
				'partner_id':order.partner_id.id,
				'partner_name':order.partner_id.name,
				'lines':order_line,
				'amount_total':order.amount_total,
				})
		return {'data':orders_data,'call_ids':call_ids}


	def print_pos_receipt(self): #TODO HERE
		orderlines = []
		discount = 0

		for orderline in self.lines:

			new_vals = {
				'id':orderline.product_id.id,
				'product_name': orderline.product_id.name,
				'total_price' : orderline.price_subtotal_incl,
				'qty': orderline.qty,
				'price_unit': orderline.price_unit,
				'discount': orderline.discount,
				}
			discount += (orderline.price_unit * orderline.qty * orderline.discount) / 100

			orderlines.append(new_vals)
		vals = {
			'discount': discount,
			'orderlines': orderlines,
			'subtotal': self.amount_total - self.amount_tax,
			'tax': self.amount_tax,
		}

		return vals


	@api.model
	def create(self, vals):
		vals['name'] = self.env['ir.sequence'].get('pos.call.order')
		return super(POSCallOrders, self).create(vals)

	@api.model
	def create_pos_call_order(self,order):
		pos_call_order_obj = self.create(self._order_fields(order))
		return {'result':pos_call_order_obj.read([])}




class POSAllOrdersLine(models.Model):
	_name = 'pos.call.order.line'
	_description="POS Call Order Line"

	def _order_line_fields(self, line):
		print("`````````````",line)
		line2 = [0,0,{}]
		product = self.env['product.product'].browse(line[2]['product_id'])
		print("//////////**********",product)
		line2[2]['skip_change'] = line[2]['skip_change']
		# line2[2]['custom_attribute_value_ids'] = line[2]['custom_attribute_value_ids']
		line2[2]['qty'] = line[2]['qty']
		line2[2]['price_unit'] = line[2]['price_unit']
		line2[2]['price_subtotal'] = line[2]['price_subtotal']
		line2[2]['price_subtotal_incl'] = line[2]['price_subtotal_incl']
		line2[2]['discount'] = line[2]['discount']
		line2[2]['product_id'] = line[2]['product_id']
		line2[2]['tax_ids'] = [(6, 0, [x.id for x in product.taxes_id])]
		# line2[2]['pack_lot_ids'] = line[2]['pack_lot_ids']
		line2[2]['attribute_value_ids'] = line[2]['attribute_value_ids']
		line2[2]['full_product_name'] = line[2]['full_product_name']	
		line2[2]['price_extra'] = line[2]['price_extra']	
		line2[2]['customer_note'] = line[2]['customer_note']	
		# line2[2]['price_type'] = line[2]['price_type']	
		line2[2]['line_flag'] = line[2]['line_flag']
		if line[2].get('line_note'):
			line2[2]['extra_note'] = line[2]['line_note']
		# line2[2]['combo_details'] = [(6, 0, [x for x in line[2]['combo_details']])]
		return line2


	company_id = fields.Many2one('res.company', string='Company', required=True, default=lambda self: self.env.user.company_id)
	notice = fields.Char(string='Discount Notice')
	extra_note = fields.Char(string="Note")
	product_id = fields.Many2one('product.product', string='Product', required=True, change_default=True)
	call_order_id = fields.Many2one('pos.call.order')
	price_unit = fields.Float(string='Unit Price', digits=0)
	qty = fields.Float('Quantity', default=1)
	price_subtotal = fields.Float(compute='_compute_amount_line_all',digits=0, string='Subtotal w/o Tax')
	price_subtotal_incl = fields.Float(compute='_compute_amount_line_all',digits=0, string='Subtotal')
	discount = fields.Float(string='Discount (%)', digits=0, default=0.0)
	create_date = fields.Datetime(string='Creation Date', readonly=True)
	tax_ids = fields.Many2many('account.tax', string='Taxes', readonly=True)
	tax_ids_after_fiscal_position = fields.Many2many('account.tax', compute='_get_tax_ids_after_fiscal_position', string='Taxes to Apply')
	combo_prod_ids = fields.Many2many('product.product',string="Combos")
	line_flag = fields.Boolean(string='Line Flag')
	attribute_value_ids = fields.Many2many('product.template.attribute.value', string="Selected Attributes")
	skip_change = fields.Boolean('Skip line when sending ticket to kitchen printers.')
	custom_attribute_value_ids = fields.One2many(
        comodel_name='product.attribute.custom.value', inverse_name='pos_order_line_id',
        string="Custom Values",
        store=True, readonly=False)
	pack_lot_ids = fields.One2many('pos.pack.operation.lot', 'pos_order_line_id', string='Lot/serial Number')
	full_product_name = fields.Char('Full Product Name')
	price_extra = fields.Float(string="Price extra")
	customer_note = fields.Char('Customer Note')

	@api.depends('price_unit', 'tax_ids', 'qty', 'discount', 'product_id')
	def _compute_amount_line_all(self):
		for line in self:
			currency = line.call_order_id.pricelist_id.currency_id
			taxes = line.tax_ids.filtered(lambda tax: tax.company_id.id == line.call_order_id.company_id.id)
			fiscal_position_id = line.call_order_id.fiscal_position_id
			if fiscal_position_id:
				taxes = fiscal_position_id.map_tax(taxes, line.product_id, line.call_order_id.partner_id)
			price = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
			line.price_subtotal = line.price_subtotal_incl = price * line.qty
			if taxes:
				taxes = taxes.compute_all(price, currency, line.qty, product=line.product_id, partner=line.call_order_id.partner_id or False)
				line.price_subtotal = taxes['total_excluded']
				line.price_subtotal_incl = taxes['total_included']

			line.price_subtotal = currency.round(line.price_subtotal)
			line.price_subtotal_incl = currency.round(line.price_subtotal_incl)

	@api.depends('call_order_id', 'call_order_id.fiscal_position_id')
	def _get_tax_ids_after_fiscal_position(self):
		for line in self:
			line.tax_ids_after_fiscal_position = line.call_order_id.fiscal_position_id.map_tax(line.tax_ids)

class PosCallOrderDiscount(models.Model):
	_name = 'pos.call.order.discount'
	_description = 'POS Call Order Discount'

	order_id = fields.Many2one('pos.call.order', string='Order', ondelete='cascade')
	discount_type = fields.Char(string='Discount Type', required=True)
	amount = fields.Float(string='Amount', required=True)
	source = fields.Char(string='Source', required=True)