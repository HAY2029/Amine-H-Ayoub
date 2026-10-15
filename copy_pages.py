import os
import shutil

src_dir = r"H:\Amine-H-Ayoub\صفحة قران"
dest_dir = r"H:\Amine-H-Ayoub\public\pages"

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

for file_name in os.listdir(src_dir):
    if file_name.endswith(".jpg"):
        full_src = os.path.join(src_dir, file_name)
        full_dest = os.path.join(dest_dir, file_name)
        shutil.copy(full_src, full_dest)
        print(f"Copied {file_name}")
