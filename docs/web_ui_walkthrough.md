# Browser walkthrough: job tracker web UI

Follow these steps to run the Flask UI locally and manage your applications from the browser.

## 1) Install Python and dependencies
1. Install Python 3.10+ (from python.org if on Windows).
2. Download this repo (ZIP from GitHub or `git clone`).
3. Open a terminal in the repo folder.
4. Install dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```

## 2) Start the web server
1. In the repo folder, run:
   ```bash
   python scripts/web_tracker.py
   ```
2. Leave this terminal window open; it keeps the server running.

## 3) Open the UI
1. In your browser, go to [http://localhost:5000](http://localhost:5000).
2. You’ll see the job table, a status filter, and forms to add/update applications.

## 4) Filter applications
- Use **Filter by status** at the top.
- Choose a status (e.g., `applied`, `interview`, `offer`) and click **Apply filter**.

## 5) Add a new application
1. In **Add application**, fill out:
   - **Company** and **Role** (required).
   - **Status** (e.g., `applied`, `interview`, `offer`).
   - Optional fields: **Applied date**, **Next action**, **Next action date**, **Contact**, **Notes**.
2. Click **Add**. A confirmation message shows at the top, and the table refreshes.

## 6) Update an application
1. In **Update application**, enter the same **Company** and **Role** to match an existing entry.
2. Fill only the fields you want to change (leave others blank to keep current values).
3. Click **Update**. You’ll see a confirmation or a message if no match is found.

## 7) Where your data lives
- All entries are stored in `data/applications.csv` in this repo.
- You can also edit that CSV directly in Excel/Sheets; the web UI will reflect changes on refresh.

## 8) Stopping the server
- Return to the terminal running the server and press **Ctrl+C** to stop it.

## Troubleshooting
- **“Module not found: flask”**: rerun `python -m pip install -r requirements.txt`.
- **Port already in use**: close other apps using port 5000 or change the port by editing `app.run(debug=True)` to `app.run(debug=True, port=5001)` and reopen [http://localhost:5001](http://localhost:5001).
