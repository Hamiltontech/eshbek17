# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
import logging
import json
import werkzeug.wrappers

_logger = logging.getLogger(__name__)



class Menu(http.Controller):
    @http.route("/api/v1/companies", methods=["GET"], type="http", auth="none", csrf=False)
    def get_company(self, **post):

        company_id = request.env["res.company"].sudo().search_read([('is_connected_to_ishbic', '=', True)], ["name"])

        return werkzeug.wrappers.Response(
        status=200,
        content_type="application/json; charset=utf-8",
        headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
        response=json.dumps(company_id, default=str)
        )
        
    @http.route("/api/v1/branches", methods=["GET"], type="http", auth="none", csrf=False)
    def send_branch(self, **post):

        company_id = http.request.params.get('company_id')
        if not company_id:
            return werkzeug.wrappers.Response(
            status=400,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps("erorr : enter company_id in query params", default=str)
        )

        if not request.env["res.company"].sudo().search([('id','=',company_id)]):
            return werkzeug.wrappers.Response(
            status=400,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps("error : invalid company_id", default=str)
        )   
        company_id = int(company_id)
        branches = request.env["pos.config"].sudo().search([('company_id','=',company_id),('is_connected_to_ishbic', '=', True)])
        branches_data = []
        for record in branches:
            record_data = {
                "id": record.id,
                "name": record.name,
                "has_active_session":record.has_active_session,
                "company":record.company_id.id,
                "phone_number":record.phone_number,
                "working_from":record.working_from,
                "working_to":record.working_to
            }
            branches_data.append(record_data)

        return werkzeug.wrappers.Response(
            status=200,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps(branches_data, default=str)
        )
    
    @http.route("/api/v1/menu", methods=["GET"], type="http", auth="none")
    def get_menu(self,*args, **kwargs):

        company_id = http.request.params.get('company_id')
        branch_id = http.request.params.get('branch_id')
        if not company_id:
            return werkzeug.wrappers.Response(
            status=400,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps("erorr : enter company_id in query params", default=str)
        )

        if not request.env["res.company"].sudo().search([('id','=',company_id)]):
            return werkzeug.wrappers.Response(
            status=400,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps("error : invalid company_id", default=str)
        )
        company_id = int(company_id)
        products = request.env["product.template"].get_products(company_id)
        
        return werkzeug.wrappers.Response(
            status=200,
            content_type="application/json; charset=utf-8",
            headers=[("Cache-Control", "no-store"), ("Pragma", "no-cache"),("Access-Control-Allow-Origin","*"),("Access-Control-Allow-Headers","*")],
            response=json.dumps(products, default=str)
        )


