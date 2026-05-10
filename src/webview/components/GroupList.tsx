import React from 'react';
import { Group } from '../types';

interface GroupListProps {
  groups: Group[];
  onSelectGroup: (group: Group) => void;
  onDeleteGroup: (name: string) => void;
}

const GroupList: React.FC<GroupListProps> = ({ groups, onSelectGroup, onDeleteGroup }) => (
  <div id="groupView">
    <ul id="groupList" className="group-list">
      {groups.map((group) => (
        <li 
          key={group.name} 
          className="list-item group-item" 
          onClick={() => onSelectGroup(group)}
        >
          <span>{group.name}</span>
          <div className="actions">
            <button 
              className="icon-btn" 
              title="Delete Group"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteGroup(group.name);
              }}
            >
              <span className="codicon codicon-trash"></span>
            </button>
          </div>
        </li>
      ))}
      {groups.length === 0 && (
         <span style={{ opacity: 0.5 }}>No groups found.</span>
      )}
    </ul>
  </div>
);

export default GroupList;
