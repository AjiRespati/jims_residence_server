
# Main Logic

    -    startDate: tanggal mulai sewa
    -    dueDate: batas akhir pembayaran sewa
    -    banishDate: batas akhir meninggalkan kost bila tidak membayar
    -    endDate: tanggal akhir sewa

1. Pembayaran didepan ?
Iya

2. Hari pertama dihitung dari waktu pembayaran atau waktu pertama masuk?
Wak pertama masuk tp max 3hari dr pembayaran

3. Pembayaran paling lama berapa hari setelah hari pertama?
7 hari bagi yg renew

4. Hari terakhir sebelum diusir = hari pertama + 30 hari ?
Hari pertama+14 hari

lastInvoiceDate
lastStartDate
lastDueDate
lastBanishDate
lastEndDate

invoiceDate
startDate
dueDate, payment due (startDate + 7 days)
banishDate, banish the tenant if the payment due (startDate + 14)
endDate

nextInvoiceDate
nextStartDate
nextDueDate
nextBanishDate
nextEndDate

## Question

Now I want to discuss the main flow of this boardingHouse. the flow of tenant lifecycle.
brainstorm first, no code.

This is the lifecycle.

Parameters:

- invoiceDate
- startDate
- dueDate, payment due
- banishDate, banish the tenant if the payment is not paid
- endDate, same date on the next month (adjust to last date of month if for example start on 31st jan)

1. fresh tenant
    - invoiceDate (first date)
    - startDate (first date or defined by app user)
    - dueDate (startDate + 7 days)
    - banishdate (startDate + 14 days)
    - endDate

2. next period
    - nextInvoiceDate (startdate + 15 days)
    - nextStartDate (endDate)
    - nextDueDate (nextStartDate + 7 days)
    - nextBanishDate (nextStartDate + 14 days)
    - nextEndDate

What do you think.
