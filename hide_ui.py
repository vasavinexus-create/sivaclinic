# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/components/PagedCrud.tsx', 'r', 'utf-8') as f:
    code = f.read()

# Add isPrintingCustom state
state_search = """const [suppliers, setSuppliers] = useState<Row[]>([]);"""
state_replace = """const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [isPrintingCustom, setIsPrintingCustom] = useState(false);"""
code = code.replace(state_search, state_replace)

# Hide main UI conditionally
main_ui_search = """return <div><div className="page-head">"""
main_ui_replace = """return <div><div className={`page-head ${isPrintingCustom ? "no-print" : ""}`}>"""
code = code.replace(main_ui_search, main_ui_replace)

panel_search = """<div className="panel"><div className="v2-toolbar">"""
panel_replace = """<div className={`panel ${isPrintingCustom ? "no-print" : ""}`}><div className="v2-toolbar">"""
code = code.replace(panel_search, panel_replace)

# Modify Print buttons to use setTimeout
print_order_search = """onClick={() => { window.print(); setShowOrderModal(false); }}"""
print_order_replace = """onClick={() => { setIsPrintingCustom(true); setTimeout(() => { window.print(); setIsPrintingCustom(false); setShowOrderModal(false); }, 100); }}"""
code = code.replace(print_order_search, print_order_replace)

print_letter_search = """onClick={() => { window.print(); setShowLetterModal(false); }}"""
print_letter_replace = """onClick={() => { setIsPrintingCustom(true); setTimeout(() => { window.print(); setIsPrintingCustom(false); setShowLetterModal(false); }, 100); }}"""
code = code.replace(print_letter_search, print_letter_replace)

with codecs.open('app/v2/components/PagedCrud.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Injected isPrintingCustom logic")
