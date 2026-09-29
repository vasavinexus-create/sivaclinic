# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Replace the overly specific CSS with a universal hide rule
old_style = """<style>{`@media print { .printing-custom > .page-head, .printing-custom > .panel, .printing-custom > .modal-wrap { display: none !important; } }`}</style>"""
new_style = """<style>{`@media print { .printing-custom .page-head, .printing-custom .panel, .printing-custom .modal-wrap, .printing-custom .v2-toolbar { display: none !important; } }`}</style>"""

code = code.replace(old_style, new_style)

# Also explicitly add print-hide classes directly to the elements just to be 100% sure
old_page_head = """<div className={`page-head ${isPrintingCustom ? "no-print" : ""}`}>"""
new_page_head = """<div className={`page-head ${isPrintingCustom ? "print-hide" : ""}`}>"""
code = code.replace(old_page_head, new_page_head)

# Replace <div className="panel"> if it's there
old_panel_1 = """<div className="panel">"""
new_panel_1 = """<div className={`panel ${isPrintingCustom ? "print-hide" : ""}`}>"""
code = code.replace(old_panel_1, new_panel_1)

old_panel_2 = """<div className={`panel ${isPrintingCustom ? "no-print" : ""}`}>"""
new_panel_2 = """<div className={`panel ${isPrintingCustom ? "print-hide" : ""}`}>"""
code = code.replace(old_panel_2, new_panel_2)

# Also the modal
old_modal_1 = """<div className="modal-wrap no-print">"""
new_modal_1 = """<div className="modal-wrap print-hide">"""
code = code.replace(old_modal_1, new_modal_1)


with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Forcibly hiding UI components")
