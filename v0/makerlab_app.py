import pandas as pd
import os
import streamlit as st
import requests
# removed BytesIO import as we will pass raw bytes to st.image

# Set Streamlit page configuration for a wider layout
st.set_page_config(layout="wide", page_title="MakerLAB Tool Finder")

def format_drive_link(url):
    if not isinstance(url, str):
        return "https://placehold.co/200x200?text=No+Image"

    url = url.strip()
    
    #splits google drive links
    if "drive.google.com" in url:
        # Extract the ID
        file_id = None
        
        # Scenario 1: /file/d/ID/view
        if "/file/d/" in url:
            try:
                file_id = url.split("/file/d/")[1].split("/")[0]
            except IndexError:
                pass
        
        # Scenario 2: id=ID parameter
        elif "id=" in url:
            try:
                file_id = url.split("id=")[1].split("&")[0]
            except IndexError:
                pass
                
        if file_id:
            return f"https://drive.google.com/uc?export=view&id={file_id}"
            
    return url

# --- Helper to Download Image Data (Bypasses Browser Blocking) ---
@st.cache_data(show_spinner=False)
def get_image_data(url):
    if not url.startswith("http"):
        return url
        
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            # Return raw bytes (st.image can handle bytes directly)
            return response.content
    except Exception:
        pass
    # If download fails, return the URL and let Streamlit try to load it
    return url

def simple_tool_search():
    st.title(" MakerLAB Tool Finder Prototype")
    st.markdown("Use the search bar to find tools by name or purpose.")
    
    filename = "tools.xlsx"
    if not os.path.exists(filename):
        st.error(f"ERROR: The file '{filename}' was not found.")
        st.warning("Please ensure your Excel file is saved as 'tools.xlsx' and is in the same directory.")
        return

    try:
        df = pd.read_excel(filename)
    except Exception as e:
        st.error(f"ERROR loading Excel file: {e}")
        return

    # Check if the required columns exist
    required_cols = ['Tool_Name', 'Image_URL', 'Tool_Purpose']
    if not all(col in df.columns for col in required_cols):
        st.error("ERROR: Excel file headers are incorrect.")
        st.warning(f"Expected columns: {required_cols}")
        return

    #User Input Bar
    search_term = st.text_input("Enter tool name or purpose:", "").lower().strip()
    
    # search process
    if not search_term:
        results = df  # Show all if empty
        st.info("Showing all tools in the database.")
    else:
        st.write(f"Searching for: **'{search_term}'**...")
        results = df[
            (df['Tool_Name'].astype(str).str.lower().str.contains(search_term)) |
            (df['Tool_Purpose'].astype(str).str.lower().str.contains(search_term))
        ].reset_index(drop=True)
    
    if results.empty:
        st.markdown("\n---  **NO RESULTS FOUND** ---")
        st.warning("Try a broader term.")
    else:
        st.success(f" FOUND {len(results)} TOOLS")
        
        # Display results in columns
        cols = st.columns(3)
        
        for index, row in results.iterrows():
            col = cols[index % 3] 
            
            with col:
                st.subheader(f"{row['Tool_Name']}")
                
                # --- APPLY THE LINK FIX ---
                clean_image_url = format_drive_link(row['Image_URL'])
                
                # --- DOWNLOAD IMAGE DATA (The Fix for Safari + Caching) ---
                image_source = get_image_data(clean_image_url)
                
                try:
                    st.image(
                        image_source, 
                        caption=row['Tool_Name'], 
                        use_container_width=True 
                    )
                except Exception:
                    st.warning("Image failed to load.")
                
                st.markdown(f"**Purpose:** {row['Tool_Purpose']}")
                st.markdown("---") 

if __name__ == "__main__":
    simple_tool_search()