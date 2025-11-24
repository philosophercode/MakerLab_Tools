import pandas as pd
import os
import streamlit as st

# Set Streamlit page configuration for a wider layout #streamlit run makerlab_app.py
st.set_page_config(layout="wide", page_title="MakerLAB Tool Finder")

# --- Main Search Application ---

def simple_tool_search(filename="tools.xlsx"):
    """
    Creates the Streamlit web interface and performs a simple search on the data.
    
    CRITICAL: The Excel file MUST have columns named 'Tool_Name', 'Image_URL', 
    and 'Tool_Purpose'.
    """
    
    st.title("🛠️ MakerLAB Tool Finder Prototype")
    st.markdown("Use the search bar to find tools by name (e.g., 'Drill') or purpose (e.g., 'cutting').")
    
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

    required_cols = ['Tool_Name', 'Image_URL', 'Tool_Purpose']
    if not all(col in df.columns for col in required_cols):
        st.error("ERROR: Excel file headers are incorrect.")
        st.warning(f"Expected columns: {required_cols}")
        return

    search_term = st.text_input("Enter tool name or purpose:", "").lower().strip()
    
    if not search_term:
        st.info("Start typing to search or see all tools below.")
        # Display the entire table when no search term is entered
        st.subheader("All Tools in Database:")
        st.dataframe(df[['Tool_Name', 'Tool_Purpose', 'Image_URL']])
        return
    
    st.write(f"Searching for: **'{search_term}'**...")

    results = df[
        (df['Tool_Name'].astype(str).str.lower().str.contains(search_term)) |
        (df['Tool_Purpose'].astype(str).str.lower().str.contains(search_term))
    ].reset_index(drop=True)
    
    if results.empty:
        st.markdown("\n---  **NO RESULTS FOUND** ---")
        st.warning("Try a broader term (e.g., 'cutting' instead of 'cut').")
    else:
        st.success(f" FOUND {len(results)} TOOLS")
        
        cols = st.columns(3) # Display up to 3 results per row
        
        for index, row in results.iterrows():
            col = cols[index % 3] 
            
            with col:
                st.subheader(f"{row['Tool_Name']}")

                try:
                    st.image(
                        row['Image_URL'], 
                        caption=row['Tool_Name'], 
                        width=250
                    )
                except Exception:
                    st.warning("Image failed to load (check URL).")
                
                st.markdown(f"**Purpose:** {row['Tool_Purpose']}")
                st.markdown("---") # Separator line

# --- Execution Block ---
if __name__ == "__main__":
    simple_tool_search()