import pdfplumber

# Open and extract text from the resume PDF
with pdfplumber.open('蒋远-软件开发工程师简历.pdf') as pdf:
    full_text = ''
    for page in pdf.pages:
        text = page.extract_text()
        if text:
            full_text += text + '\n'

# Output the extracted text
print(full_text)
